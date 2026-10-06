import { z } from 'zod'
import { createTool } from '../types'
import { listNotes } from '../../services/vault'

export const listFilesTool = createTool({
  name: 'list_files',
  description:
    'List markdown note files and folders in the Obsidian vault, indicating which notes are subject to 2FA protection.',
  schema: z.object({
    folder: z
      .string()
      .optional()
      .describe('Optional subfolder path to list (e.g. "Daily" or "Projects/App"). Defaults to vault root.'),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to list recursively within subfolders (default: true).'),
  }),
  execute: async ({ folder, recursive }) => {
    return await listNotes({ folder, recursive })
  },
})

