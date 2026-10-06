import matter from 'gray-matter'
import { normalize, join, relative, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { assertFileAccess } from '../security/guard'
import { isProtectedPath } from '../security/patterns'
import { isSessionUnlocked } from '../security/session'

export interface NoteFile {
  path: string
  name: string
  folder: string
  isProtected: boolean
}

export interface NoteDetail extends NoteFile {
  content: string
  frontmatter: Record<string, any>
}

export interface SearchResult {
  path: string
  name: string
  folder: string
  isProtected: boolean
  requiresUnlock: boolean
  snippet?: string
  matchesCount: number
}

export function getVaultDir(): string {
  return Bun.env.VAULT_DIR || '/app/vault'
}

export function sanitizePath(inputPath: string): string {
  const vaultDir = resolve(getVaultDir())
  const normalizedInput = normalize(inputPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = resolve(join(vaultDir, normalizedInput))

  if (!fullPath.startsWith(vaultDir)) {
    throw new Error('Access denied: path traversal attempt.')
  }

  const rel = relative(vaultDir, fullPath).replace(/\\/g, '/')
  return rel.replace(/^\/+/, '')
}

export function shouldIgnoreFile(relPath: string): boolean {
  if (
    relPath.startsWith('.') ||
    relPath.includes('/.') ||
    relPath.startsWith('headless-vault-livesync-v2') ||
    relPath.startsWith('node_modules')
  ) {
    return true
  }
  return false
}

export async function readNote(relPath: string, sessionId?: string): Promise<NoteDetail> {
  const safePath = sanitizePath(relPath)
  const fullPath = join(getVaultDir(), safePath)

  if (!existsSync(fullPath)) {
    throw new Error(`File not found: '${safePath}'`)
  }

  // Security guard check
  assertFileAccess(safePath, sessionId)

  const raw = await Bun.file(fullPath).text()
  const parsed = matter(raw)

  const name = safePath.split('/').pop()?.replace(/\.md$/, '') || safePath
  const folder = safePath.includes('/') ? safePath.substring(0, safePath.lastIndexOf('/')) : ''

  return {
    path: safePath,
    name,
    folder,
    isProtected: isProtectedPath(safePath),
    content: parsed.content,
    frontmatter: parsed.data || {},
  }
}

export async function listNotes(options?: {
  folder?: string
  recursive?: boolean
}): Promise<NoteFile[]> {
  const vaultDir = getVaultDir()
  const folder = options?.folder ? sanitizePath(options.folder) : ''
  const searchDir = folder ? join(vaultDir, folder) : vaultDir
  const isRecursive = options?.recursive !== false

  if (!existsSync(searchDir)) {
    throw new Error(`Folder not found: '${folder}'`)
  }

  const pattern = isRecursive ? '**/*.md' : '*.md'
  const files: NoteFile[] = []

  for await (const file of new Bun.Glob(pattern).scan({ cwd: searchDir })) {
    const fullRelPath = folder ? `${folder}/${file}` : file
    if (shouldIgnoreFile(fullRelPath)) continue

    const name = file.split('/').pop()?.replace(/\.md$/, '') || file
    const relFolder = fullRelPath.includes('/')
      ? fullRelPath.substring(0, fullRelPath.lastIndexOf('/'))
      : ''

    files.push({
      path: fullRelPath,
      name,
      folder: relFolder,
      isProtected: isProtectedPath(fullRelPath),
    })
  }

  files.sort((a, b) => a.path.localeCompare(b.path))
  return files
}

export async function searchNotes(
  query: string,
  options?: { folder?: string; sessionId?: string; maxResults?: number }
): Promise<SearchResult[]> {
  const vaultDir = getVaultDir()
  const folder = options?.folder ? sanitizePath(options.folder) : ''
  const searchDir = folder ? join(vaultDir, folder) : vaultDir
  const maxResults = options?.maxResults || 50
  const sessionId = options?.sessionId
  const isUnlocked = sessionId ? isSessionUnlocked(sessionId) : false

  if (!existsSync(searchDir)) {
    throw new Error(`Folder not found: '${folder}'`)
  }

  const results: SearchResult[] = []
  const lowerQuery = query.toLowerCase()

  for await (const file of new Bun.Glob('**/*.md').scan({ cwd: searchDir })) {
    const fullRelPath = folder ? `${folder}/${file}` : file
    if (shouldIgnoreFile(fullRelPath)) continue

    const protectedFile = isProtectedPath(fullRelPath)
    const requiresUnlock = protectedFile && !isUnlocked

    const fullPath = join(vaultDir, fullRelPath)
    const raw = await Bun.file(fullPath).text()
    const lowerContent = raw.toLowerCase()

    const name = file.split('/').pop()?.replace(/\.md$/, '') || file
    const relFolder = fullRelPath.includes('/')
      ? fullRelPath.substring(0, fullRelPath.lastIndexOf('/'))
      : ''

    if (lowerContent.includes(lowerQuery) || name.toLowerCase().includes(lowerQuery)) {
      let snippet: string | undefined

      if (requiresUnlock) {
        snippet = '[Protected content hidden. Authenticate with unlock_session to view.]'
      } else {
        const idx = lowerContent.indexOf(lowerQuery)
        if (idx !== -1) {
          const start = Math.max(0, idx - 50)
          const end = Math.min(raw.length, idx + query.length + 50)
          snippet = (start > 0 ? '...' : '') + raw.slice(start, end).replace(/\n/g, ' ') + (end < raw.length ? '...' : '')
        }
      }

      // Count occurrences
      let count = 0
      let pos = 0
      while ((pos = lowerContent.indexOf(lowerQuery, pos)) !== -1) {
        count++
        pos += lowerQuery.length
      }

      results.push({
        path: fullRelPath,
        name,
        folder: relFolder,
        isProtected: protectedFile,
        requiresUnlock,
        snippet,
        matchesCount: count || 1,
      })

      if (results.length >= maxResults) break
    }
  }

  results.sort((a, b) => b.matchesCount - a.matchesCount)
  return results
}

