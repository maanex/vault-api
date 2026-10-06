import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const getBacklinksTool = createTool({
  name: 'get_backlinks',
  description:
    'Find all notes that link to a specific note in the Obsidian vault, including line numbers and surrounding sentence context.',
  schema: z.object({
    note: z
      .string()
      .describe('Note name, relative path, or alias to inspect backlinks for (e.g. "Alice", "People/Alice.md", or "Project Alpha").'),
  }),
  execute: async ({ note }, context) => {
    const engine = new GraphEngine()
    const backlinks = engine.getBacklinks(note, context.sessionId)
    return {
      target: note,
      count: backlinks.length,
      backlinks,
    }
  },
})

