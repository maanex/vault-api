import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const findUnresolvedTool = createTool({
  name: 'find_unresolved',
  description:
    'Find all unresolved / broken wikilinks (links pointing to notes that have not yet been created), grouped by target and frequency.',
  schema: z.object({}),
  execute: async () => {
    const engine = new GraphEngine()
    const unresolved = engine.findUnresolved()
    return {
      count: unresolved.length,
      unresolved,
    }
  },
})

