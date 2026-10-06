import type { AppTool } from './types'
import { unlockSessionTool } from './tools/unlock_session'
import { readNoteTool } from './tools/read_note'
import { searchNotesTool } from './tools/search_notes'
import { listFilesTool } from './tools/list_files'
import { getTasksTool } from './tools/get_tasks'
import { getBirthdaysTool } from './tools/get_birthdays'

export const tools: AppTool[] = [
  unlockSessionTool,
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

