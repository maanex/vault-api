import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let dbInstance: Database | null = null

export function getDbPath(): string {
  const cacheDir = Bun.env.GRAPH_CACHE_DIR || join(process.cwd(), '.graph-cache')
  mkdirSync(cacheDir, { recursive: true })
  return join(cacheDir, 'index.db')
}

export function getDatabase(inMemory = false): Database {
  if (dbInstance && !inMemory) {
    return dbInstance
  }

  const db = inMemory ? new Database(':memory:') : new Database(getDbPath())

  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA synchronous = NORMAL;')

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL,
      title TEXT,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      is_protected INTEGER NOT NULL DEFAULT 0
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      target_raw TEXT NOT NULL,
      target_resolved TEXT,
      link_text TEXT,
      line_number INTEGER NOT NULL,
      sentence_context TEXT,
      is_embed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_path TEXT NOT NULL,
      tag TEXT NOT NULL,
      line_number INTEGER,
      FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_path TEXT NOT NULL,
      alias TEXT NOT NULL,
      FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
    );
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_notes_name ON notes(name);')
  db.run('CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);')
  db.run('CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path);')
  db.run('CREATE INDEX IF NOT EXISTS idx_links_resolved ON links(target_resolved);')
  db.run('CREATE INDEX IF NOT EXISTS idx_links_raw ON links(target_raw);')
  db.run('CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);')
  db.run('CREATE INDEX IF NOT EXISTS idx_tags_note ON tags(note_path);')
  db.run('CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases(alias);')

  if (!inMemory) {
    dbInstance = db
  }

  return db
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

