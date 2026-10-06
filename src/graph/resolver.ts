import type { Database } from 'bun:sqlite'

export class WikilinkResolver {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  resolve(targetRaw: string, sourcePath?: string): string | null {
    const cleanTarget = targetRaw.trim().replace(/^\/+/, '')
    const targetWithExt = cleanTarget.endsWith('.md') ? cleanTarget : `${cleanTarget}.md`

    // 1. Exact relative path match
    const exactQuery = this.db.query<{ path: string }, [string]>('SELECT path FROM notes WHERE path = ? LIMIT 1')
    const exact = exactQuery.get(targetWithExt)
    if (exact) {
      return exact.path
    }

    // 2. Relative to source folder match (if sourcePath is provided)
    if (sourcePath && sourcePath.includes('/')) {
      const sourceFolder = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
      const relativePath = `${sourceFolder}/${targetWithExt}`
      const relMatch = exactQuery.get(relativePath)
      if (relMatch) {
        return relMatch.path
      }
    }

    // 3. Alias match
    const aliasQuery = this.db.query<{ note_path: string }, [string]>(
      'SELECT note_path FROM aliases WHERE LOWER(alias) = LOWER(?) LIMIT 1'
    )
    const aliasMatch = aliasQuery.get(cleanTarget)
    if (aliasMatch) {
      return aliasMatch.note_path
    }

    // 4. Basename match across all folders (e.g. [[Alice]] -> People/Alice.md)
    const targetBaseName = cleanTarget.split('/').pop()?.replace(/\.md$/, '') || cleanTarget
    const nameQuery = this.db.query<{ path: string }, [string]>(
      'SELECT path FROM notes WHERE LOWER(name) = LOWER(?) LIMIT 1'
    )
    const nameMatch = nameQuery.get(targetBaseName)
    if (nameMatch) {
      return nameMatch.path
    }

    return null
  }
}

