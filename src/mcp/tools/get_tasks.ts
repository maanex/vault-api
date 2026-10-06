import { z } from 'zod'
import matter from 'gray-matter'
import { dirname, basename, join } from 'node:path'
import { existsSync } from 'node:fs'
import { createTool } from '../types'
import { getVaultDir, shouldIgnoreFile } from '../../services/vault'

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

  const inlineTags = content.match(/#([a-zA-Z0-9_/-]+)/g)
  if (inlineTags && inlineTags.some(checkTag)) return true

  return false
}

function parseDueDate(due: unknown): { date: Date; raw: string } | null {
  if (!due) return null
  if (due instanceof Date) {
    return isNaN(due.getTime()) ? null : { date: due, raw: due.toISOString().split('T')[0]! }
  }
  if (typeof due === 'string') {
    const trimmed = due.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T23:59:59`)
      return isNaN(d.getTime()) ? null : { date: d, raw: trimmed }
    }
    const d = new Date(trimmed)
    return isNaN(d.getTime()) ? null : { date: d, raw: trimmed }
  }
  return null
}

export const getTasksTool = createTool({
  name: 'get_tasks',
  description:
    'Query upcoming non-completed tasks (tagged with #task and due within the next 72 hours).',
  schema: z.object({}),
  execute: async () => {
    const vaultDir = getVaultDir()
    if (!existsSync(vaultDir)) {
      return []
    }

    const now = new Date()
    const threshold = new Date(now.getTime() + 72 * 60 * 60 * 1000)
    const tasks: Array<{ name: string; due: string; category: string | null; folder: string; _dueDate: Date }> = []

    for await (const file of new Bun.Glob('**/*.md').scan({ cwd: vaultDir })) {
      if (shouldIgnoreFile(file)) continue
      if (file.startsWith('Templates/') || file === 'Templates.md' || file.startsWith('Templates')) continue

      const filePath = join(vaultDir, file)
      const content = await Bun.file(filePath).text()
      const parsed = matter(content)
      const data = parsed.data || {}

      if (data.completed === true || data.completed === 'true') continue
      if (!hasTaskTag(data, parsed.content)) continue

      const parsedDue = parseDueDate(data.due)
      if (!parsedDue) continue
      if (parsedDue.date.getTime() > threshold.getTime()) continue

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

    tasks.sort((a, b) => {
      const timeDiff = a._dueDate.getTime() - b._dueDate.getTime()
      if (timeDiff !== 0) return timeDiff
      return a.name.localeCompare(b.name)
    })

    return tasks.map(({ name, due, category, folder }) => ({
      name,
      due,
      category,
      folder,
    }))
  },
})

