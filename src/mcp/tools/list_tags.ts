import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const listTagsTool = createTool({
  name: 'list_tags',
  description:
    'List all tags used across the Obsidian vault with note counts and member note lists.',
  schema: z.object({}),
  execute: async () => {
    const engine = new GraphEngine()
    const tags = engine.listTags()
    return {
      totalUniqueTags: tags.length,
      tags,
    }
  },
})

