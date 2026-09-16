import { Hono } from 'hono'
import matter from 'gray-matter'
import { dirname, basename } from 'node:path'

export interface TaskItem {
  name: string
  due: string
  category: string | null
  folder: string
}

function hasTaskTag(data: Record<string, any>, content: string): boolean {
  const checkTag = (t: unknown): boolean => {
    if (typeof t === 'string') {
      const normalized = t.replace(/^#/, '').toLowerCase().trim()
      return normalized === 'task' || normalized.startsWith('task/')
    }
    return false
  }

  const frontmatterTags = [
    ...(Array.isArray(data.tags) ? data.tags : typeof data.tags === 'string' ? data.tags.split(/[,\s]+/) : []),
    ...(Array.isArray(data.tag) ? data.tag : typeof data.tag === 'string' ? data.tag.split(/[,\s]+/) : []),
  ]

  if (frontmatterTags.some(checkTag)) return true

  // Check inline tags in markdown body (e.g. #task or #task/work)
  const inlineTags = content.match(/#([a-zA-Z0-9_/-]+)/g)
  if (inlineTags && inlineTags.some(checkTag)) return true

  return false
}

function parseDueDate(due: unknown): { date: Date; raw: string } | null {
  if (!due)
    return null

  if (due instanceof Date) {
    if (isNaN(due.getTime()))
      return null
    return {
      date: due,
      raw: due.toISOString().split('T')[0]!
    }
  }

  if (typeof due === 'string') {
    const trimmed = due.trim()
    if (!trimmed)
      return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T23:59:59`)
      return isNaN(d.getTime()) ? null : { date: d, raw: trimmed }
    }
    const d = new Date(trimmed)
    return isNaN(d.getTime()) ? null : { date: d, raw: trimmed }
  }
  return null
}

export default new Hono()
  .get('/', async (c) => {
    const vaultDir = Bun.env.VAULT_DIR || '/app/vault'
    const now = new Date()
    const threshold = new Date(now.getTime() + 72 * 60 * 60 * 1000)

    const tasks: Array<TaskItem & { _dueDate: Date }> = []

    try {
      for await (const file of new Bun.Glob('**/*.md').scan({ cwd: vaultDir })) {
        // Skip hidden files and internal database folders
        if (file.startsWith('.') || file.includes('/.') || file.startsWith('headless-vault-livesync-v2')) {
          continue
        }

        // Filter: !file.path.startsWith("Templates")
        if (file.startsWith('Templates/') || file === 'Templates.md' || file.startsWith('Templates')) {
          continue
        }

        const filePath = `${vaultDir}/${file}`
        const content = await Bun.file(filePath).text()
        const parsed = matter(content)
        const data = parsed.data || {}

        // Filter: completed != true
        if (data.completed === true || data.completed === 'true') {
          continue
        }

        // Filter: file.tags.contains("task")
        if (!hasTaskTag(data, parsed.content)) {
          continue
        }

        // Filter: due <= now() + '72h'
        const parsedDue = parseDueDate(data.due)
        if (!parsedDue) {
          continue
        }

        if (parsedDue.date.getTime() > threshold.getTime()) {
          continue
        }

        const rawFolder = dirname(file)
        const folder = rawFolder === '.' ? '' : rawFolder
        const name = basename(file, '.md')
        const category = data.category !== undefined && data.category !== null ? String(data.category) : null

        tasks.push({
          name,
          due: parsedDue.raw,
          category,
          folder,
          _dueDate: parsedDue.date,
        })
      }
    } catch {
      return c.json({ error: 'Vault directory not found' }, 404)
    }

    // Sort: due ASC, file.name ASC
    tasks.sort((a, b) => {
      const timeDiff = a._dueDate.getTime() - b._dueDate.getTime()
      if (timeDiff !== 0) return timeDiff
      return a.name.localeCompare(b.name)
    })

    const results: TaskItem[] = tasks.map(({ name, due, category, folder }) => ({
      name,
      due,
      category,
      folder,
    }))

    return c.json(results)
  })
