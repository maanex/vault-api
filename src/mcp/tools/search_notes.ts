import { z } from 'zod'
import { createTool } from '../types'
import { searchNotes } from '../../services/vault'

export const searchNotesTool = createTool({
  name: 'search_notes',
  description:
    'Search across all notes in the Obsidian vault by keyword or phrase. Protected notes will indicate their presence but conceal snippet details until unlocked.',
  schema: z.object({
    query: z.string().describe('The search query or keyword to find within notes.'),
    folder: z
      .string()
      .optional()
      .describe('Optional subfolder path to limit the search scope (e.g. "Projects" or "Work").'),
    maxResults: z
      .number()
      .optional()
      .default(30)
      .describe('Maximum number of matching notes to return (default: 30).'),
  }),
  execute: async ({ query, folder, maxResults }, context) => {
    return await searchNotes(query, {
      folder,
      sessionId: context.sessionId,
      maxResults,
    })
  },
})

