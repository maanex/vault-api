import { z } from 'zod'

export interface ToolContext {
  sessionId: string
}

export interface AppTool {
  name: string
  description: string
  schema: z.ZodObject<any>
  execute: (params: any, context: ToolContext) => Promise<any>
}

export function createTool<TSchema extends z.ZodObject<any>>(tool: {
  name: string
  description: string
  schema: TSchema
  execute: (params: z.infer<TSchema>, context: ToolContext) => Promise<any>
}): AppTool {
  return tool
}

