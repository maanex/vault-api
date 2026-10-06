import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const getNotesByTagTool = createTool({
  name: 'get_notes_by_tag',
  description:
    'Find all notes carrying a specific tag (including nested sub-tags, e.g. querying "project" returns notes tagged with "#project" or "#project/active").',
  schema: z.object({
    tag: z.string().describe('Tag name to search for (e.g. "task", "project", or "ai/research").'),
  }),
  execute: async ({ tag }) => {
    const engine = new GraphEngine()
    const notes = engine.getNotesByTag(tag)
    return {
      tag,
      count: notes.length,
      notes,
    }
  },
})

