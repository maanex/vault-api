import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as OTPAuth from 'otpauth'
import { getDatabase, closeDatabase } from '../src/graph/db'
import { parseNoteContent } from '../src/graph/parser'
import { WikilinkResolver } from '../src/graph/resolver'
import { VaultIndexer } from '../src/graph/indexer'
import { GraphEngine } from '../src/graph/engine'
import { unlockSession } from '../src/security/session'
import { toolMap } from '../src/mcp/registry'

const TEST_VAULT = join(process.cwd(), 'scratch_graph_vault')
const TEST_CACHE = join(process.cwd(), 'scratch_graph_cache')
const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'

describe('Obsidian Graph & Knowledge Engine', () => {
  beforeEach(() => {
    Bun.env.VAULT_DIR = TEST_VAULT
    Bun.env.GRAPH_CACHE_DIR = TEST_CACHE
    Bun.env.PROTECTED_FILE_PATTERNS = 'Private/**'
    Bun.env.AUTH_TOTP_SECRET = TEST_TOTP_SECRET

    mkdirSync(join(TEST_VAULT, 'Projects'), { recursive: true })
    mkdirSync(join(TEST_VAULT, 'People'), { recursive: true })
    mkdirSync(join(TEST_VAULT, 'Private'), { recursive: true })
    mkdirSync(join(TEST_VAULT, 'Archive'), { recursive: true })

    // Note 1: Architecture
    writeFileSync(
      join(TEST_VAULT, 'Architecture.md'),
      `---
title: System Architecture
tags: [architecture, tech/backend]
aliases: [System Arch, Backend Blueprint]
---
# System Architecture
This core system connects to [[Projects/App]] and references [[People/Bob|Lead Engineer Bob]].
Also check out ![[Private/Secrets#Database]].`
    )

    // Note 2: App
    writeFileSync(
      join(TEST_VAULT, 'Projects', 'App.md'),
      `---
tags: [project/active]
---
# Mobile Application
We build upon [[Architecture]]. Managed by [[Bob]].`
    )

    // Note 3: Bob
    writeFileSync(
      join(TEST_VAULT, 'People', 'Bob.md'),
      `---
aliases: [Robert]
tags: [team/lead]
---
# Bob
Lead architect who designed [[Architecture]] and works with [[Alice]].`
    )

    // Note 4: Alice
    writeFileSync(
      join(TEST_VAULT, 'People', 'Alice.md'),
      `---
tags: [team]
---
# Alice
Engineer collaborating on [[Projects/App]].`
    )

    // Note 5: Private Note
    writeFileSync(
      join(TEST_VAULT, 'Private', 'Secrets.md'),
      `---
tags: [confidential]
---
# Secrets
Confidential database credentials linked to [[Architecture]].`
    )

    // Note 6: Orphaned note
    writeFileSync(
      join(TEST_VAULT, 'Archive', 'OldMemo.md'),
      `---
tags: [legacy]
---
# Old Memo
No connections here.`
    )
  })

  afterEach(() => {
    closeDatabase()
    rmSync(TEST_VAULT, { recursive: true, force: true })
    rmSync(TEST_CACHE, { recursive: true, force: true })
  })

  describe('Markdown Parser & Wikilink Extraction', () => {
    it('extracts titles, aliases, tags, and wikilinks with anchors and embeds', () => {
      const raw = `---
title: Custom Title
aliases: [Alias 1, Alias 2]
tags: [tag1, tag2/sub]
---
# Header
Link to [[Target Note#Section|Display Text]] and embed ![[Diagram.png]]. #inline-tag
`
      const parsed = parseNoteContent('Folder/Note.md', raw)
      expect(parsed.title).toBe('Custom Title')
      expect(parsed.aliases).toEqual(['Alias 1', 'Alias 2'])
      expect(parsed.tags.map((t) => t.tag)).toContain('tag1')
      expect(parsed.tags.map((t) => t.tag)).toContain('tag2/sub')
      expect(parsed.tags.map((t) => t.tag)).toContain('inline-tag')

      expect(parsed.links.length).toBe(2)
      expect(parsed.links[0].targetRaw).toBe('Target Note')
      expect(parsed.links[0].targetAnchor).toBe('Section')
      expect(parsed.links[0].linkText).toBe('Display Text')
      expect(parsed.links[0].isEmbed).toBe(false)

      expect(parsed.links[1].targetRaw).toBe('Diagram.png')
      expect(parsed.links[1].isEmbed).toBe(true)
    })
  })

  describe('Vault Indexer & Resolver', () => {
    it('indexes all notes and resolves links correctly', async () => {
      const db = getDatabase(true) // in-memory db for test
      const indexer = new VaultIndexer(db)

      const result = await indexer.indexVault(TEST_VAULT)
      expect(result.totalIndexed).toBe(6)

      const resolver = new WikilinkResolver(db)
      // Basename match
      expect(resolver.resolve('Bob')).toBe('People/Bob.md')
      expect(resolver.resolve('App')).toBe('Projects/App.md')
      // Alias match
      expect(resolver.resolve('Robert')).toBe('People/Bob.md')
      expect(resolver.resolve('Backend Blueprint')).toBe('Architecture.md')
      // Exact path match
      expect(resolver.resolve('People/Alice.md')).toBe('People/Alice.md')
    })
  })

  describe('Graph Engine Query Capabilities', () => {
    it('retrieves backlinks with sentence context and redacts protected files when locked', async () => {
      const db = getDatabase(true)
      const indexer = new VaultIndexer(db)
      await indexer.indexVault(TEST_VAULT)

      const engine = new GraphEngine(db)

      // Backlinks to Architecture.md
      const backlinks = engine.getBacklinks('Architecture.md', 'session-locked')
      expect(backlinks.length).toBe(3) // App.md, Bob.md, and Secrets.md

      // Public backlink
      const appBacklink = backlinks.find((b) => b.sourcePath === 'Projects/App.md')
      expect(appBacklink).toBeDefined()
      expect(appBacklink?.sentenceContext).toContain('Architecture')

      // Protected backlink when locked -> redacted
      const secretBacklink = backlinks.find((b) => b.sourcePath === 'Private/Secrets.md')
      expect(secretBacklink).toBeDefined()
      expect(secretBacklink?.isProtected).toBe(true)
      expect(secretBacklink?.sentenceContext).toContain('Protected content')

      // Unlock session
      const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(TEST_TOTP_SECRET), digits: 6 })
      unlockSession('session-unlocked', totp.generate())

      const unlockedBacklinks = engine.getBacklinks('Architecture.md', 'session-unlocked')
      const secretUnlocked = unlockedBacklinks.find((b) => b.sourcePath === 'Private/Secrets.md')
      expect(secretUnlocked?.sentenceContext).toContain('credentials linked to')
    })

    it('finds N-hop neighborhood and shortest paths', async () => {
      const db = getDatabase(true)
      const indexer = new VaultIndexer(db)
      await indexer.indexVault(TEST_VAULT)

      const engine = new GraphEngine(db)

      // 1-hop neighborhood of Architecture
      const neighborhood = engine.getNeighborhood('Architecture', 1)
      expect(neighborhood).not.toBeNull()
      expect(neighborhood!.nodes.length).toBeGreaterThanOrEqual(4)

      // Shortest path from Alice to Architecture (Alice -> App -> Architecture or Alice -> Bob -> Architecture)
      const path = engine.findPath('People/Alice.md', 'Architecture.md')
      expect(path.found).toBe(true)
      expect(path.length).toBe(2)
      expect(path.hops[0].from).toBe('People/Alice.md')
      expect(path.hops[1].to).toBe('Architecture.md')
    })

    it('finds orphans, tags, and vault overview statistics', async () => {
      const db = getDatabase(true)
      const indexer = new VaultIndexer(db)
      await indexer.indexVault(TEST_VAULT)

      const engine = new GraphEngine(db)

      // Orphans
      const orphans = engine.findOrphans()
      expect(orphans.length).toBe(1)
      expect(orphans[0].path).toBe('Archive/OldMemo.md')

      // Tags
      const tags = engine.listTags()
      expect(tags.some((t) => t.tag === 'architecture')).toBe(true)

      // Notes by tag (including nested)
      const backendNotes = engine.getNotesByTag('tech')
      expect(backendNotes.length).toBe(1)
      expect(backendNotes[0].path).toBe('Architecture.md')

      // Overview
      const overview = engine.getVaultOverview()
      expect(overview.totalNotes).toBe(6)
      expect(overview.orphanedCount).toBe(1)
      expect(overview.hubNotes.length).toBeGreaterThan(0)
    })

    it('generates context bundle within token budget', async () => {
      const db = getDatabase(true)
      const indexer = new VaultIndexer(db)
      await indexer.indexVault(TEST_VAULT)

      const engine = new GraphEngine(db)
      const bundle = await engine.getContextBundle('Architecture', 2000, 1, 'session-test')

      expect(bundle.rootNote.title).toBe('System Architecture')
      expect(bundle.neighbors.length).toBeGreaterThan(0)
      expect(bundle.totalTokenEstimate).toBeGreaterThan(0)
    })
  })

  describe('MCP Tool Registration', () => {
    it('has all 16 tools registered and callable', () => {
      const expectedTools = [
        'unlock_session',
        'get_context_bundle',
        'get_backlinks',
        'get_outgoing_links',
        'get_neighborhood',
        'find_path',
        'find_orphans',
        'find_unresolved',
        'list_tags',
        'get_notes_by_tag',
        'vault_overview',
        'read_note',
        'search_notes',
        'list_files',
        'get_tasks',
        'get_birthdays',
      ]

      for (const toolName of expectedTools) {
        expect(toolMap.has(toolName)).toBe(true)
      }
    })
  })
})

