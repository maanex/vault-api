import { z } from 'zod'
import { createTool } from '../types'
import { GraphEngine } from '../../graph/engine'

export const getOutgoingLinksTool = createTool({
  name: 'get_outgoing_links',
  description:
    'Find all outgoing wikilinks and embeds contained within a specific note.',
  schema: z.object({
    note: z
      .string()
      .describe('Note name, relative path, or alias to inspect outgoing links for (e.g. "Projects/Ideas.md").'),
  }),
  execute: async ({ note }, context) => {
    const engine = new GraphEngine()
    const links = engine.getOutgoingLinks(note, context.sessionId)
    return {
      source: note,
      count: links.length,
      links,
    }
  },
})

