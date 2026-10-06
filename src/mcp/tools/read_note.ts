import { z } from 'zod'
import { createTool } from '../types'
import { readNote } from '../../services/vault'

export const readNoteTool = createTool({
  name: 'read_note',
  description:
    'Read the complete markdown content and frontmatter metadata of a specific note in the Obsidian vault. Protected files require an unlocked session.',
  schema: z.object({
    path: z
      .string()
      .describe('Relative path to the note in the vault, e.g. "Projects/Ideas.md" or "Daily/2026-10-06.md".'),
  }),
  execute: async ({ path }, context) => {
    return await readNote(path, context.sessionId)
  },
})

