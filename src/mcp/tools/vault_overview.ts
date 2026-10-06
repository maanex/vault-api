import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const vaultOverviewTool = createTool({
  name: 'vault_overview',
  description:
    'Get a high-level statistical overview of the vault knowledge graph: note counts, total links, top tags, most connected hub notes, and orphan counts.',
  schema: z.object({}),
  execute: async () => {
    const engine = new GraphEngine()
    return engine.getVaultOverview()
  },
})

