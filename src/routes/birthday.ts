import { Hono } from 'hono'
import matter from 'gray-matter'


export default new Hono()
  .get('/:date?', async (c) => {
    const targetDate = c.req.param('date') || new Date().toISOString().slice(5, 10)
    const peopleDir = `${Bun.env.VAULT_DIR || '/app/vault'}/People`

    const results: Array<[ name: string, age: number ]> = []
    try {
      for await (const file of new Bun.Glob('*.md').scan({ cwd: peopleDir })) {
        const content = await Bun.file(`${peopleDir}/${file}`).text()
        const parsed = matter(content)
        const birthday = parsed.data?.birthday

        if (!birthday)
          continue

        const bdayStr = (birthday instanceof Date)
          ? birthday.toISOString().split('T')[0]!
          : String(birthday)

        const bdayDate = (birthday instanceof Date)
          ? birthday
          : new Date(bdayStr)

        const name = file.replace('.md', '')
        const age = new Date().getFullYear() - bdayDate.getFullYear()

        if (bdayStr.endsWith(targetDate))
          results.push([name, age])
      }
    } catch {
      return c.json({ error: 'People folder not found' }, 404)
    }

    return c.json(results)
  })
