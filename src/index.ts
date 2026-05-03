import { Hono } from 'hono'
import birthday from './routes/birthday'

const app = new Hono()
const PORT = Number(Bun.env.PORT || 3063)

app.route('/birthdays', birthday)

console.log(`API running on port ${PORT}`)
Bun.serve({
	port: PORT,
	fetch: app.fetch,
})
