import { watch, existsSync, type FSWatcher } from 'node:fs'
import { join, relative } from 'node:path'
import { VaultIndexer } from './indexer'
import { shouldIgnoreFile, getVaultDir } from '../services/vault'

let watcherInstance: FSWatcher | null = null
const debounceTimers = new Map<string, Timer>()

export function startVaultWatcher(vaultDir: string = getVaultDir()): FSWatcher | null {
  if (watcherInstance) {
    return watcherInstance
  }

  if (!existsSync(vaultDir)) {
    console.warn(`[VaultWatcher] Directory '${vaultDir}' does not exist yet. Watcher paused.`)
    return null
  }

  const indexer = new VaultIndexer()

  try {
    watcherInstance = watch(vaultDir, { recursive: true }, (eventType, filename) => {
      if (!filename || typeof filename !== 'string') return

      const normalized = filename.replace(/\\/g, '/')
      if (!normalized.endsWith('.md')) return
      if (shouldIgnoreFile(normalized)) return

      // Debounce events per file (300ms)
      if (debounceTimers.has(normalized)) {
        clearTimeout(debounceTimers.get(normalized)!)
      }

      const timer = setTimeout(async () => {
        debounceTimers.delete(normalized)
        try {
          await indexer.indexFile(normalized, vaultDir)
        } catch (err) {
          console.warn(`[VaultWatcher] Failed to index ${normalized}:`, err)
        }
      }, 300)

      debounceTimers.set(normalized, timer)
    })

    console.log(`[VaultWatcher] Watching '${vaultDir}' for real-time changes...`)
    return watcherInstance
  } catch (err) {
    console.warn('[VaultWatcher] Failed to start watcher:', err)
    return null
  }
}

export function stopVaultWatcher(): void {
  if (watcherInstance) {
    watcherInstance.close()
    watcherInstance = null
  }
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
}

