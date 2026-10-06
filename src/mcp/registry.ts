import type { AppTool } from './types'
import { unlockSessionTool } from './tools/unlock_session'
import { readNoteTool } from './tools/read_note'
import { searchNotesTool } from './tools/search_notes'
import { listFilesTool } from './tools/list_files'
import { getTasksTool } from './tools/get_tasks'
import { getBirthdaysTool } from './tools/get_birthdays'
import { getBacklinksTool } from './tools/get_backlinks'
import { getOutgoingLinksTool } from './tools/get_outgoing_links'
import { getNeighborhoodTool } from './tools/get_neighborhood'
import { findPathTool } from './tools/find_path'
import { findOrphansTool } from './tools/find_orphans'
import { findUnresolvedTool } from './tools/find_unresolved'
import { listTagsTool } from './tools/list_tags'
import { getNotesByTagTool } from './tools/get_notes_by_tag'
import { vaultOverviewTool } from './tools/vault_overview'
import { getContextBundleTool } from './tools/get_context_bundle'

export const tools: AppTool[] = [
  // Session & Security
  unlockSessionTool,

  // Knowledge Graph & Context Engine
  getContextBundleTool,
  getBacklinksTool,
  getOutgoingLinksTool,
  getNeighborhoodTool,
  findPathTool,
  findOrphansTool,
  findUnresolvedTool,
  listTagsTool,
  getNotesByTagTool,
  vaultOverviewTool,

  // Core File & Query Tools
  readNoteTool,
  searchNotesTool,
  listFilesTool,
  getTasksTool,
  getBirthdaysTool,
]

export const toolMap = new Map<string, AppTool>(tools.map((t) => [t.name, t]))

export function getTool(name: string): AppTool | undefined {
  return toolMap.get(name)
}
