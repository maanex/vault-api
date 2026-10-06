import type { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { getDatabase } from './db'
import { WikilinkResolver } from './resolver'
import { isProtectedPath } from '../security/patterns'
import { isSessionUnlocked } from '../security/session'
import { assertFileAccess } from '../security/guard'
import { getVaultDir } from '../services/vault'

export interface BacklinkItem {
  sourcePath: string
  sourceName: string
  lineNumber: number
  linkText?: string
  sentenceContext: string
  isEmbed: boolean
  isProtected: boolean
}

export interface OutgoingLinkItem {
  targetRaw: string
  targetResolved: string | null
  targetName: string
  lineNumber: number
  linkText?: string
  isEmbed: boolean
  isProtected: boolean
}

export interface GraphNode {
  path: string
  name: string
  folder: string
  title: string
  isProtected: boolean
  inDegree: number
  outDegree: number
  hopDistance: number
}

export interface GraphEdge {
  source: string
  target: string
  isEmbed: boolean
  linkText?: string
}

export interface NeighborhoodResult {
  root: string
  depth: number
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface PathHop {
  from: string
  to: string
  linkText?: string
  sentenceContext: string
  isEmbed: boolean
}

export interface ShortestPathResult {
  from: string
  to: string
  found: boolean
  length: number
  hops: PathHop[]
}

export interface TagInfo {
  tag: string
  count: number
  notes: string[]
}

export interface VaultOverview {
  totalNotes: number
  totalLinks: number
  totalTags: number
  topTags: Array<{ tag: string; count: number }>
  hubNotes: Array<{ path: string; name: string; totalDegree: number; inDegree: number; outDegree: number }>
  orphanedCount: number
  unresolvedLinksCount: number
}

export interface ContextBundleResult {
  rootNote: {
    path: string
    title: string
    content: string
    frontmatter: Record<string, any>
  }
  neighbors: Array<{
    path: string
    title: string
    hopDistance: number
    relation: 'outgoing' | 'backlink'
    content: string
    isProtected: boolean
  }>
  totalTokenEstimate: number
}

export class GraphEngine {
  private db: Database
  private resolver: WikilinkResolver

  constructor(db?: Database) {
    this.db = db || getDatabase()
    this.resolver = new WikilinkResolver(this.db)
  }

  resolveNote(identifier: string): string | null {
    return this.resolver.resolve(identifier)
  }

  getBacklinks(noteIdentifier: string, sessionId?: string): BacklinkItem[] {
    const resolvedPath = this.resolveNote(noteIdentifier)
    if (!resolvedPath) {
      return []
    }

    const isUnlocked = sessionId ? isSessionUnlocked(sessionId) : false

    const query = this.db.query<
      {
        source_path: string
        name: string
        line_number: number
        link_text: string | null
        sentence_context: string
        is_embed: number
        is_protected: number
      },
      [string]
    >(`
      SELECT 
        l.source_path,
        n.name,
        l.line_number,
        l.link_text,
        l.sentence_context,
        l.is_embed,
        n.is_protected
      FROM links l
      JOIN notes n ON l.source_path = n.path
      WHERE l.target_resolved = ?
      ORDER BY n.name ASC, l.line_number ASC
    `)

    const rows = query.all(resolvedPath)

    return rows.map((r) => {
      const isProt = r.is_protected === 1 || isProtectedPath(r.source_path)
      const context = isProt && !isUnlocked ? '[Protected content - use unlock_session to view]' : r.sentence_context

      return {
        sourcePath: r.source_path,
        sourceName: r.name,
        lineNumber: r.line_number,
        linkText: r.link_text || undefined,
        sentenceContext: context,
        isEmbed: r.is_embed === 1,
        isProtected: isProt,
      }
    })
  }

  getOutgoingLinks(noteIdentifier: string, sessionId?: string): OutgoingLinkItem[] {
    const resolvedPath = this.resolveNote(noteIdentifier)
    if (!resolvedPath) {
      return []
    }

    const query = this.db.query<
      {
        target_raw: string
        target_resolved: string | null
        line_number: number
        link_text: string | null
        is_embed: number
      },
      [string]
    >(`
      SELECT target_raw, target_resolved, line_number, link_text, is_embed
      FROM links
      WHERE source_path = ?
      ORDER BY line_number ASC
    `)

    const rows = query.all(resolvedPath)

    return rows.map((r) => {
      const targetName = r.target_resolved
        ? r.target_resolved.split('/').pop()?.replace(/\.md$/, '') || r.target_resolved
        : r.target_raw

      const isProt = r.target_resolved ? isProtectedPath(r.target_resolved) : false

      return {
        targetRaw: r.target_raw,
        targetResolved: r.target_resolved,
        targetName,
        lineNumber: r.line_number,
        linkText: r.link_text || undefined,
        isEmbed: r.is_embed === 1,
        isProtected: isProt,
      }
    })
  }

  getNeighborhood(
    noteIdentifier: string,
    depth: number = 1,
    maxNodes: number = 50,
    sessionId?: string
  ): NeighborhoodResult | null {
    const rootPath = this.resolveNote(noteIdentifier)
    if (!rootPath) {
      return null
    }

    const visitedNodes = new Map<string, number>() // path -> hop distance
    const edges: GraphEdge[] = []
    const queue: Array<{ path: string; currentDepth: number }> = [{ path: rootPath, currentDepth: 0 }]
    visitedNodes.set(rootPath, 0)

    const linkQuery = this.db.query<
      { source_path: string; target_resolved: string; is_embed: number; link_text: string | null },
      [string, string]
    >(`
      SELECT source_path, target_resolved, is_embed, link_text
      FROM links
      WHERE (source_path = ? OR target_resolved = ?) AND target_resolved IS NOT NULL
    `)

    while (queue.length > 0 && visitedNodes.size < maxNodes) {
      const current = queue.shift()!
      if (current.currentDepth >= depth) continue

      const links = linkQuery.all(current.path, current.path)
      for (const link of links) {
        const neighborPath = link.source_path === current.path ? link.target_resolved : link.source_path
        if (!neighborPath) continue

        edges.push({
          source: link.source_path,
          target: link.target_resolved,
          isEmbed: link.is_embed === 1,
          linkText: link.link_text || undefined,
        })

        if (!visitedNodes.has(neighborPath)) {
          visitedNodes.set(neighborPath, current.currentDepth + 1)
          queue.push({ path: neighborPath, currentDepth: current.currentDepth + 1 })
          if (visitedNodes.size >= maxNodes) break
        }
      }
    }

    // Fetch details for all collected nodes
    const nodeDetailsQuery = this.db.query<
      {
        path: string
        name: string
        folder: string
        title: string
        is_protected: number
        in_degree: number
        out_degree: number
      },
      [string]
    >(`
      SELECT 
        n.path, 
        n.name, 
        n.folder, 
        n.title, 
        n.is_protected,
        (SELECT COUNT(*) FROM links WHERE target_resolved = n.path) as in_degree,
        (SELECT COUNT(*) FROM links WHERE source_path = n.path AND target_resolved IS NOT NULL) as out_degree
      FROM notes n
      WHERE n.path = ?
    `)

    const nodes: GraphNode[] = []
    for (const [nodePath, hop] of visitedNodes.entries()) {
      const detail = nodeDetailsQuery.get(nodePath)
      if (detail) {
        nodes.push({
          path: detail.path,
          name: detail.name,
          folder: detail.folder,
          title: detail.title,
          isProtected: detail.is_protected === 1 || isProtectedPath(detail.path),
          inDegree: detail.in_degree,
          outDegree: detail.out_degree,
          hopDistance: hop,
        })
      }
    }

    // Deduplicate edges
    const uniqueEdgesMap = new Map<string, GraphEdge>()
    for (const edge of edges) {
      const key = `${edge.source}->${edge.target}`
      if (!uniqueEdgesMap.has(key)) {
        uniqueEdgesMap.set(key, edge)
      }
    }

    return {
      root: rootPath,
      depth,
      nodes,
      edges: Array.from(uniqueEdgesMap.values()),
    }
  }

  findPath(
    fromIdentifier: string,
    toIdentifier: string,
    maxDepth: number = 5,
    sessionId?: string
  ): ShortestPathResult {
    const fromPath = this.resolveNote(fromIdentifier)
    const toPath = this.resolveNote(toIdentifier)

    if (!fromPath || !toPath) {
      return { from: fromIdentifier, to: toIdentifier, found: false, length: 0, hops: [] }
    }

    if (fromPath === toPath) {
      return { from: fromPath, to: toPath, found: true, length: 0, hops: [] }
    }

    const isUnlocked = sessionId ? isSessionUnlocked(sessionId) : false
    const queue: Array<{ current: string; hops: PathHop[] }> = [{ current: fromPath, hops: [] }]
    const visited = new Set<string>([fromPath])

    const outgoingLinksQuery = this.db.query<
      {
        target_resolved: string
        link_text: string | null
        sentence_context: string
        is_embed: number
      },
      [string]
    >(`
      SELECT target_resolved, link_text, sentence_context, is_embed
      FROM links
      WHERE source_path = ? AND target_resolved IS NOT NULL
    `)

    while (queue.length > 0) {
      const { current, hops } = queue.shift()!
      if (hops.length >= maxDepth) continue

      const links = outgoingLinksQuery.all(current)
      for (const link of links) {
        const nextPath = link.target_resolved
        if (!nextPath) continue

        const isProt = isProtectedPath(current)
        const context = isProt && !isUnlocked ? '[Protected content - use unlock_session to view]' : link.sentence_context

        const newHop: PathHop = {
          from: current,
          to: nextPath,
          linkText: link.link_text || undefined,
          sentenceContext: context,
          isEmbed: link.is_embed === 1,
        }

        const nextHops = [...hops, newHop]

        if (nextPath === toPath) {
          return {
            from: fromPath,
            to: toPath,
            found: true,
            length: nextHops.length,
            hops: nextHops,
          }
        }

        if (!visited.has(nextPath)) {
          visited.add(nextPath)
          queue.push({ current: nextPath, hops: nextHops })
        }
      }
    }

    return { from: fromPath, to: toPath, found: false, length: 0, hops: [] }
  }

  findOrphans(): Array<{ path: string; name: string; folder: string; title: string }> {
    const query = this.db.query<{ path: string; name: string; folder: string; title: string }, []>(`
      SELECT n.path, n.name, n.folder, n.title
      FROM notes n
      WHERE NOT EXISTS (
        SELECT 1 FROM links l WHERE l.source_path = n.path AND l.target_resolved IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM links l WHERE l.target_resolved = n.path
      )
      ORDER BY n.path ASC
    `)

    return query.all()
  }

  findUnresolved(): Array<{ targetRaw: string; count: number; referencingNotes: string[] }> {
    const query = this.db.query<{ target_raw: string; source_path: string }, []>(`
      SELECT target_raw, source_path
      FROM links
      WHERE target_resolved IS NULL
      ORDER BY target_raw ASC
    `)

    const rows = query.all()
    const map = new Map<string, Set<string>>()

    for (const row of rows) {
      if (!map.has(row.target_raw)) {
        map.set(row.target_raw, new Set())
      }
      map.get(row.target_raw)!.add(row.source_path)
    }

    const results = Array.from(map.entries()).map(([targetRaw, sources]) => ({
      targetRaw,
      count: sources.size,
      referencingNotes: Array.from(sources),
    }))

    results.sort((a, b) => b.count - a.count)
    return results
  }

  listTags(): TagInfo[] {
    const query = this.db.query<{ tag: string; note_path: string }, []>(`
      SELECT tag, note_path FROM tags ORDER BY tag ASC
    `)

    const rows = query.all()
    const map = new Map<string, Set<string>>()

    for (const row of rows) {
      if (!map.has(row.tag)) {
        map.set(row.tag, new Set())
      }
      map.get(row.tag)!.add(row.note_path)
    }

    return Array.from(map.entries()).map(([tag, notes]) => ({
      tag,
      count: notes.size,
      notes: Array.from(notes),
    }))
  }

  getNotesByTag(tagQuery: string): Array<{ path: string; name: string; title: string; tag: string }> {
    const cleanTag = tagQuery.replace(/^#/, '').toLowerCase().trim()

    const query = this.db.query<
      { path: string; name: string; title: string; tag: string },
      [string, string]
    >(`
      SELECT DISTINCT n.path, n.name, n.title, t.tag
      FROM notes n
      JOIN tags t ON n.path = t.note_path
      WHERE t.tag = ? OR t.tag LIKE ?
      ORDER BY n.name ASC
    `)

    return query.all(cleanTag, `${cleanTag}/%`)
  }

  getVaultOverview(): VaultOverview {
    const totalNotes = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM notes').get()?.count || 0
    const totalLinks = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM links').get()?.count || 0
    const totalTags = this.db.query<{ count: number }, []>('SELECT COUNT(DISTINCT tag) as count FROM tags').get()?.count || 0

    const topTags = this.db
      .query<{ tag: string; count: number }, []>(
        'SELECT tag, COUNT(DISTINCT note_path) as count FROM tags GROUP BY tag ORDER BY count DESC LIMIT 10'
      )
      .all()

    const hubNotes = this.db
      .query<
        { path: string; name: string; totalDegree: number; inDegree: number; outDegree: number },
        []
      >(`
        SELECT 
          n.path, 
          n.name,
          ((SELECT COUNT(*) FROM links WHERE target_resolved = n.path) + 
           (SELECT COUNT(*) FROM links WHERE source_path = n.path AND target_resolved IS NOT NULL)) as totalDegree,
          (SELECT COUNT(*) FROM links WHERE target_resolved = n.path) as inDegree,
          (SELECT COUNT(*) FROM links WHERE source_path = n.path AND target_resolved IS NOT NULL) as outDegree
        FROM notes n
        ORDER BY totalDegree DESC
        LIMIT 10
      `)
      .all()

    const orphans = this.findOrphans().length
    const unresolved = this.findUnresolved().length

    return {
      totalNotes,
      totalLinks,
      totalTags,
      topTags,
      hubNotes,
      orphanedCount: orphans,
      unresolvedLinksCount: unresolved,
    }
  }

  async getContextBundle(
    noteIdentifier: string,
    maxTokens: number = 4000,
    maxHops: number = 1,
    sessionId?: string
  ): Promise<ContextBundleResult> {
    const rootPath = this.resolveNote(noteIdentifier)
    if (!rootPath) {
      throw new Error(`Note not found: '${noteIdentifier}'`)
    }

    // Security guard for root note
    assertFileAccess(rootPath, sessionId)

    const isUnlocked = sessionId ? isSessionUnlocked(sessionId) : false
    const vaultDir = getVaultDir()

    const rootRaw = await Bun.file(join(vaultDir, rootPath)).text()
    const { parseNoteContent } = await import('./parser')
    const rootParsed = parseNoteContent(rootPath, rootRaw)

    const rootNote = {
      path: rootPath,
      title: rootParsed.title,
      content: rootParsed.bodyContent,
      frontmatter: rootParsed.frontmatter,
    }

    // Estimate tokens roughly (1 token ~= 4 chars)
    let currentTokens = Math.ceil(rootRaw.length / 4)

    const neighborhood = this.getNeighborhood(rootPath, maxHops, 20, sessionId)
    const neighbors: ContextBundleResult['neighbors'] = []

    if (neighborhood) {
      for (const node of neighborhood.nodes) {
        if (node.path === rootPath) continue

        const nodeProt = node.isProtected || isProtectedPath(node.path)
        let neighborBody = ''

        if (nodeProt && !isUnlocked) {
          neighborBody = '[Protected content - use unlock_session to view]'
        } else {
          try {
            const raw = await Bun.file(join(vaultDir, node.path)).text()
            const parsed = parseNoteContent(node.path, raw)
            // Trim very long notes to keep within budget
            neighborBody = parsed.bodyContent.slice(0, 1500)
          } catch {
            neighborBody = ''
          }
        }

        const neighborTokenEst = Math.ceil(neighborBody.length / 4)
        if (currentTokens + neighborTokenEst > maxTokens) {
          break
        }

        currentTokens += neighborTokenEst

        const isOutgoing = neighborhood.edges.some((e) => e.source === rootPath && e.target === node.path)

        neighbors.push({
          path: node.path,
          title: node.title,
          hopDistance: node.hopDistance,
          relation: isOutgoing ? 'outgoing' : 'backlink',
          content: neighborBody,
          isProtected: nodeProt,
        })
      }
    }

    return {
      rootNote,
      neighbors,
      totalTokenEstimate: currentTokens,
    }
  }
}

