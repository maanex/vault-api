import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const getContextBundleTool = createTool({
  name: 'get_context_bundle',
  description:
    'Generate a rich, token-budgeted context package for a topic note and its connected 1-hop and 2-hop neighbor notes to provide focused context for AI reasoning.',
  schema: z.object({
    note: z
      .string()
      .describe('The central note name, relative path, or alias to build the context bundle around (e.g. "Architecture" or "Project Alpha").'),
    maxTokens: z
      .number()
      .optional()
      .default(4000)
      .describe('Maximum estimated token budget for the context bundle (default: 4000).'),
    maxHops: z
      .number()
      .optional()
      .default(1)
      .describe('Neighbor hop distance to include (default: 1, max: 2).'),
  }),
  execute: async ({ note, maxTokens, maxHops }, context) => {
    const engine = new GraphEngine()
    return await engine.getContextBundle(note, maxTokens, maxHops, context.sessionId)
  },
})

