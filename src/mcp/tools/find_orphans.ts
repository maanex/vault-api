import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const findOrphansTool = createTool({
  name: 'find_orphans',
  description:
    'Identify all isolated "orphan" notes in the vault that have neither incoming backlinks nor outgoing links.',
  schema: z.object({}),
  execute: async () => {
    const engine = new GraphEngine()
    const orphans = engine.findOrphans()
    return {
      count: orphans.length,
      orphans,
    }
  },
})

