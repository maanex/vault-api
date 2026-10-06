import { Hono } from 'hono'
import birthday from './routes/birthday'
import tasks from './routes/tasks'
import mcp from './mcp/server'

const app = new Hono()
const PORT = Number(Bun.env.PORT || 3063)

app.route('/birthdays', birthday)
app.route('/tasks', tasks)
app.route('/mcp', mcp)

console.log(`API running on port ${PORT}`)
Bun.serve({
	port: PORT,
	fetch: app.fetch,
})
