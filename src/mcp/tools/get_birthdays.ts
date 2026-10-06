import { z } from 'zod'
import matter from 'gray-matter'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createTool } from '../types'
import { getVaultDir } from '../../services/vault'

export const getBirthdaysTool = createTool({
  name: 'get_birthdays',
  description:
    'Query birthdays for a specific day (or today by default) from notes located in the /People folder.',
  schema: z.object({
    date: z
      .string()
      .optional()
      .describe('Target date in "MM-DD" format (e.g. "10-06"). Defaults to today.'),
  }),
  execute: async ({ date }) => {
    const targetDate = date || new Date().toISOString().slice(5, 10)
    const peopleDir = join(getVaultDir(), 'People')

    if (!existsSync(peopleDir)) {
      return []
    }

    const results: Array<{ name: string; age: number }> = []

    for await (const file of new Bun.Glob('*.md').scan({ cwd: peopleDir })) {
      const content = await Bun.file(join(peopleDir, file)).text()
      const parsed = matter(content)
      const birthday = parsed.data?.birthday

      if (!birthday) continue

      const bdayStr = birthday instanceof Date ? birthday.toISOString().split('T')[0]! : String(birthday)
      const bdayDate = birthday instanceof Date ? birthday : new Date(bdayStr)

      const name = file.replace(/\.md$/, '')
      const age = new Date().getFullYear() - bdayDate.getFullYear()

      if (bdayStr.endsWith(targetDate)) {
        results.push({ name, age })
      }
    }

    return results
  },
})

