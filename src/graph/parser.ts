import matter from 'gray-matter'
import { basename, dirname } from 'node:path'

export interface ParsedLink {
  targetRaw: string
  targetAnchor?: string
  linkText?: string
  lineNumber: number
  sentenceContext: string
  isEmbed: boolean
}

export interface ParsedTag {
  tag: string
  lineNumber?: number
}

export interface ParsedNoteData {
  path: string
  name: string
  folder: string
  title: string
  frontmatter: Record<string, any>
  bodyContent: string
  links: ParsedLink[]
  tags: ParsedTag[]
  aliases: string[]
}

const WIKILINK_REGEX = /(!)?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g
const INLINE_TAG_REGEX = /(?:^|\s)#([a-zA-Z0-9_\/-]+)(?=\s|$|[.,;:!?])/g

function extractSentenceContext(line: string, matchIndex: number, matchLength: number): string {
  const cleanLine = line.trim()
  if (cleanLine.length <= 150) {
    return cleanLine
  }

  const start = Math.max(0, matchIndex - 50)
  const end = Math.min(line.length, matchIndex + matchLength + 50)
  return (start > 0 ? '...' : '') + line.slice(start, end).trim() + (end < line.length ? '...' : '')
}

export function parseNoteContent(relPath: string, rawContent: string): ParsedNoteData {
  const parsed = matter(rawContent)
  const data = parsed.data || {}
  const body = parsed.content

  const name = basename(relPath, '.md')
  const rawFolder = dirname(relPath)
  const folder = rawFolder === '.' ? '' : rawFolder

  // 1. Extract title
  let title = data.title ? String(data.title) : ''
  if (!title) {
    const headerMatch = body.match(/^#\s+(.+)$/m)
    if (headerMatch && headerMatch[1]) {
      title = headerMatch[1].trim()
    } else {
      title = name
    }
  }

  // 2. Extract aliases
  const aliases: string[] = []
  const rawAliases = data.aliases || data.alias
  if (Array.isArray(rawAliases)) {
    aliases.push(...rawAliases.map((a) => String(a).trim()).filter(Boolean))
  } else if (typeof rawAliases === 'string') {
    aliases.push(...rawAliases.split(/[,\n]/).map((a) => a.trim()).filter(Boolean))
  }

  // 3. Extract tags
  const tags: ParsedTag[] = []
  const tagSet = new Set<string>()

  const addTag = (t: unknown, lineNumber?: number) => {
    if (typeof t === 'string') {
      const normalized = t.replace(/^#/, '').toLowerCase().trim()
      if (normalized && !tagSet.has(normalized)) {
        tagSet.add(normalized)
        tags.push({ tag: normalized, lineNumber })
      }
    }
  }

  const frontmatterTags = [
    ...(Array.isArray(data.tags) ? data.tags : typeof data.tags === 'string' ? data.tags.split(/[,\s]+/) : []),
    ...(Array.isArray(data.tag) ? data.tag : typeof data.tag === 'string' ? data.tag.split(/[,\s]+/) : []),
  ]
  frontmatterTags.forEach((t) => addTag(t, 1))

  // 4. Extract links & inline tags line by line
  const links: ParsedLink[] = []
  const lines = rawContent.split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNum = index + 1

    // Extract inline tags
    let tagMatch: RegExpExecArray | null
    while ((tagMatch = INLINE_TAG_REGEX.exec(line)) !== null) {
      if (tagMatch[1]) {
        addTag(tagMatch[1], lineNum)
      }
    }

    // Extract wikilinks
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = WIKILINK_REGEX.exec(line)) !== null) {
      const isEmbed = !!linkMatch[1]
      const targetRaw = linkMatch[2]?.trim() || ''
      const targetAnchor = linkMatch[3]?.trim()
      const linkText = linkMatch[4]?.trim()

      if (targetRaw) {
        const sentenceContext = extractSentenceContext(line, linkMatch.index, linkMatch[0].length)

        links.push({
          targetRaw,
          targetAnchor,
          linkText,
          lineNumber: lineNum,
          sentenceContext,
          isEmbed,
        })
      }
    }
  })

  return {
    path: relPath,
    name,
    folder,
    title,
    frontmatter: data,
    bodyContent: body,
    links,
    tags,
    aliases,
  }
}

