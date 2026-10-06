import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const findPathTool = createTool({
  name: 'find_path',
  description:
    'Find the shortest connection path between two notes in the Obsidian vault knowledge graph.',
  schema: z.object({
    from: z.string().describe('Origin note name or path (e.g. "Concept A").'),
    to: z.string().describe('Target note name or path (e.g. "Concept B").'),
    maxDepth: z
      .number()
      .optional()
      .default(5)
      .describe('Maximum path depth to search (default: 5).'),
  }),
  execute: async ({ from, to, maxDepth }, context) => {
    const engine = new GraphEngine()
    return engine.findPath(from, to, maxDepth, context.sessionId)
  },
})

