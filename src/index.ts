import { Hono } from 'hono'
import birthday from './routes/birthday'
import tasks from './routes/tasks'

const app = new Hono()
const PORT = Number(Bun.env.PORT || 3063)

app.route('/birthdays', birthday)
app.route('/tasks', tasks)

console.log(`API running on port ${PORT}`)
Bun.serve({
	port: PORT,
	fetch: app.fetch,
})
