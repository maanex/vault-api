import { statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { getDatabase } from './db'
import { parseNoteContent } from './parser'
import { WikilinkResolver } from './resolver'
import { isProtectedPath } from '../security/patterns'
import { shouldIgnoreFile, getVaultDir } from '../services/vault'

export class VaultIndexer {
  private db: Database
  private resolver: WikilinkResolver

  constructor(db?: Database) {
    this.db = db || getDatabase()
    this.resolver = new WikilinkResolver(this.db)
  }

  async indexVault(vaultDir: string = getVaultDir()): Promise<{ totalIndexed: number; updated: number }> {
    if (!existsSync(vaultDir)) {
      return { totalIndexed: 0, updated: 0 }
    }

    const currentFilesOnDisk = new Set<string>()
    let updatedCount = 0

    const getNoteRecord = this.db.query<{ path: string; mtime: number; size: number }, [string]>(
      'SELECT path, mtime, size FROM notes WHERE path = ?'
    )

    const insertNote = this.db.query<void, [string, string, string, string, number, number, number]>(`
      INSERT INTO notes (path, name, folder, title, mtime, size, is_protected)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        folder = excluded.folder,
        title = excluded.title,
        mtime = excluded.mtime,
        size = excluded.size,
        is_protected = excluded.is_protected;
    `)

    const deleteTags = this.db.query<void, [string]>('DELETE FROM tags WHERE note_path = ?')
    const insertTag = this.db.query<void, [string, string, number | null]>(
      'INSERT INTO tags (note_path, tag, line_number) VALUES (?, ?, ?)'
    )

    const deleteAliases = this.db.query<void, [string]>('DELETE FROM aliases WHERE note_path = ?')
    const insertAlias = this.db.query<void, [string, string]>('INSERT INTO aliases (note_path, alias) VALUES (?, ?)')

    const deleteLinks = this.db.query<void, [string]>('DELETE FROM links WHERE source_path = ?')
    const insertLink = this.db.query<void, [string, string, string | null, string | null, number, string, number]>(`
      INSERT INTO links (source_path, target_raw, target_resolved, link_text, line_number, sentence_context, is_embed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    for await (const file of new Bun.Glob('**/*.md').scan({ cwd: vaultDir })) {
      if (shouldIgnoreFile(file)) continue

      currentFilesOnDisk.add(file)
      const fullPath = join(vaultDir, file)
      const stat = statSync(fullPath)
      const mtime = Math.floor(stat.mtimeMs)
      const size = stat.size

      const existing = getNoteRecord.get(file)
      if (existing && existing.mtime === mtime && existing.size === size) {
        continue // File unchanged
      }

      updatedCount++
      const rawContent = await Bun.file(fullPath).text()
      const parsed = parseNoteContent(file, rawContent)
      const isProtected = isProtectedPath(file) ? 1 : 0

      this.db.transaction(() => {
        insertNote.run(file, parsed.name, parsed.folder, parsed.title, mtime, size, isProtected)

        deleteTags.run(file)
        parsed.tags.forEach((t) => insertTag.run(file, t.tag, t.lineNumber || null))

        deleteAliases.run(file)
        parsed.aliases.forEach((a) => insertAlias.run(file, a))

        deleteLinks.run(file)
        parsed.links.forEach((l) => {
          insertLink.run(
            file,
            l.targetRaw,
            null, // resolved in second pass
            l.linkText || null,
            l.lineNumber,
            l.sentenceContext,
            l.isEmbed ? 1 : 0
          )
        })
      })()
    }

    // Remove deleted files
    const allKnownNotes = this.db.query<{ path: string }, []>('SELECT path FROM notes').all()
    const deleteNote = this.db.query<void, [string]>('DELETE FROM notes WHERE path = ?')

    this.db.transaction(() => {
      for (const note of allKnownNotes) {
        if (!currentFilesOnDisk.has(note.path)) {
          deleteNote.run(note.path)
        }
      }
    })()

    // Resolve all links
    this.resolveAllLinks()

    const total = this.db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM notes').get()?.count || 0
    return { totalIndexed: total, updated: updatedCount }
  }

  async indexFile(relPath: string, vaultDir: string = getVaultDir()): Promise<void> {
    if (shouldIgnoreFile(relPath)) return

    const fullPath = join(vaultDir, relPath)
    if (!existsSync(fullPath)) {
      // File deleted
      this.db.run('DELETE FROM notes WHERE path = ?', [relPath])
      this.resolveAllLinks()
      return
    }

    const stat = statSync(fullPath)
    const mtime = Math.floor(stat.mtimeMs)
    const size = stat.size
    const rawContent = await Bun.file(fullPath).text()
    const parsed = parseNoteContent(relPath, rawContent)
    const isProtected = isProtectedPath(relPath) ? 1 : 0

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO notes (path, name, folder, title, mtime, size, is_protected)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           name = excluded.name,
           folder = excluded.folder,
           title = excluded.title,
           mtime = excluded.mtime,
           size = excluded.size,
           is_protected = excluded.is_protected`,
        [relPath, parsed.name, parsed.folder, parsed.title, mtime, size, isProtected]
      )

      this.db.run('DELETE FROM tags WHERE note_path = ?', [relPath])
      parsed.tags.forEach((t) => {
        this.db.run('INSERT INTO tags (note_path, tag, line_number) VALUES (?, ?, ?)', [
          relPath,
          t.tag,
          t.lineNumber || null,
        ])
      })

      this.db.run('DELETE FROM aliases WHERE note_path = ?', [relPath])
      parsed.aliases.forEach((a) => {
        this.db.run('INSERT INTO aliases (note_path, alias) VALUES (?, ?)', [relPath, a])
      })

      this.db.run('DELETE FROM links WHERE source_path = ?', [relPath])
      parsed.links.forEach((l) => {
        const resolved = this.resolver.resolve(l.targetRaw, relPath)
        this.db.run(
          `INSERT INTO links (source_path, target_raw, target_resolved, link_text, line_number, sentence_context, is_embed)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [relPath, l.targetRaw, resolved, l.linkText || null, l.lineNumber, l.sentenceContext, l.isEmbed ? 1 : 0]
        )
      })
    })()

    this.resolveAllLinks()
  }

  resolveAllLinks(): void {
    const unresolvedLinks = this.db
      .query<{ id: number; source_path: string; target_raw: string }, []>(
        'SELECT id, source_path, target_raw FROM links'
      )
      .all()

    const updateLink = this.db.query<void, [string | null, number]>('UPDATE links SET target_resolved = ? WHERE id = ?')

    this.db.transaction(() => {
      for (const link of unresolvedLinks) {
        const resolved = this.resolver.resolve(link.target_raw, link.source_path)
        updateLink.run(resolved, link.id)
      }
    })()
  }
}

