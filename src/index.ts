import { Hono } from 'hono'
import birthday from './routes/birthday'
import tasks from './routes/tasks'
import mcp from './mcp/server'
import { VaultIndexer } from './graph/indexer'
import { startVaultWatcher } from './graph/watcher'

const app = new Hono()
const PORT = Number(Bun.env.PORT || 3063)

app.route('/birthdays', birthday)
app.route('/tasks', tasks)
app.route('/mcp', mcp)

// Initialize knowledge graph indexing and real-time vault watcher
const indexer = new VaultIndexer()
indexer
  .indexVault()
  .then((stats) => {
    console.log(`[GraphIndex] Indexed ${stats.totalIndexed} notes (${stats.updated} updated)`)
    startVaultWatcher()
  })
  .catch((err) => {
    console.warn('[GraphIndex] Initial indexing deferred (vault path may not exist yet):', err.message)
    startVaultWatcher()
  })

console.log(`API running on port ${PORT}`)
Bun.serve({
  port: PORT,
  fetch: app.fetch,
})
