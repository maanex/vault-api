import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const getNeighborhoodTool = createTool({
  name: 'get_neighborhood',
  description:
    'Extract the connected N-hop subgraph around a note (both incoming and outgoing links), returning a structured list of nodes and edges.',
  schema: z.object({
    note: z
      .string()
      .describe('Starting note name, relative path, or alias (e.g. "Architecture" or "Docs/Index.md").'),
    depth: z
      .number()
      .optional()
      .default(1)
      .describe('Hop distance to traverse (default: 1, max recommended: 3).'),
    maxNodes: z
      .number()
      .optional()
      .default(30)
      .describe('Maximum number of neighbor nodes to include (default: 30).'),
  }),
  execute: async ({ note, depth, maxNodes }, context) => {
    const engine = new GraphEngine()
    const result = engine.getNeighborhood(note, depth, maxNodes, context.sessionId)
    if (!result) {
      throw new Error(`Note not found: '${note}'`)
    }
    return result
  },
})

