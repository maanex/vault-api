import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { tools, getTool } from './registry'

class HonoSSETransport implements Transport {
  public readonly sessionId: string
  public onclose?: () => void
  public onerror?: (error: Error) => void
  public onmessage?: (message: JSONRPCMessage) => void

  private sendSSEMessage: (event: string, data: string) => Promise<void>
  private closed = false

  constructor(sessionId: string, sendSSEMessage: (event: string, data: string) => Promise<void>) {
    this.sessionId = sessionId
    this.sendSSEMessage = sendSSEMessage
  }

  async start(): Promise<void> {
    await this.sendSSEMessage('endpoint', `/mcp/messages?sessionId=${this.sessionId}`)
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) return
    await this.sendSSEMessage('message', JSON.stringify(message))
  }

  async handleIncomingMessage(message: JSONRPCMessage): Promise<void> {
    if (this.onmessage) {
      this.onmessage(message)
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.onclose) {
      this.onclose()
    }
  }
}

const activeTransports = new Map<string, HonoSSETransport>()

function createMcpServer(sessionId: string): Server {
  const server = new Server(
    {
      name: 'obsidian-vault-api',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => {
        let inputSchema: any = { type: 'object', properties: {} }
        if (tool.schema && typeof (tool.schema as any).toJSONSchema === 'function') {
          inputSchema = (tool.schema as any).toJSONSchema()
        }
        return {
          name: tool.name,
          description: tool.description,
          inputSchema,
        }
      }),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const tool = getTool(name)

    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool '${name}' not found.`)
    }

    const parseResult = tool.schema.safeParse(args || {})
    if (!parseResult.success) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid parameters for tool '${name}': ${parseResult.error.message}`,
          },
        ],
      }
    }

    try {
      const result = await tool.execute(parseResult.data, { sessionId })
      const textOutput =
        typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2)

      return {
        content: [
          {
            type: 'text',
            text: textOutput,
          },
        ],
      }
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: error.message || String(error),
          },
        ],
      }
    }
  })

  return server
}

async function handleDirectJsonRpc(message: any, sessionId: string) {
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'obsidian-vault-api', version: '1.0.0' },
      },
    }
  }

  if (message.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: tools.map((tool) => {
          let inputSchema: any = { type: 'object', properties: {} }
          if (tool.schema && typeof (tool.schema as any).toJSONSchema === 'function') {
            inputSchema = (tool.schema as any).toJSONSchema()
          }
          return {
            name: tool.name,
            description: tool.description,
            inputSchema,
          }
        }),
      },
    }
  }

  if (message.method === 'tools/call') {
    const { name, arguments: args } = message.params || {}
    const tool = getTool(name)
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Tool '${name}' not found.` },
      }
    }

    const parseResult = tool.schema.safeParse(args || {})
    if (!parseResult.success) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          isError: true,
          content: [{ type: 'text', text: `Invalid parameters: ${parseResult.error.message}` }],
        },
      }
    }

    try {
      const result = await tool.execute(parseResult.data, { sessionId })
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        },
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          isError: true,
          content: [{ type: 'text', text: err.message || String(err) }],
        },
      }
    }
  }

  if (message.method === 'ping') {
    return { jsonrpc: '2.0', id: message.id, result: {} }
  }

  return {
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: `Method '${message.method}' not implemented.` },
  }
}

const mcp = new Hono()

// GET /mcp — SSE connection endpoint
mcp.get('/', async (c) => {
  const sessionId = crypto.randomUUID()

  return streamSSE(c, async (stream) => {
    const transport = new HonoSSETransport(sessionId, async (event, data) => {
      await stream.writeSSE({ event, data })
    })

    activeTransports.set(sessionId, transport)

    const server = createMcpServer(sessionId)
    await server.connect(transport)

    stream.onAbort(() => {
      activeTransports.delete(sessionId)
      transport.close()
    })

    while (!stream.aborted) {
      await stream.sleep(15000)
      if (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: 'heartbeat' })
      }
    }
  })
})

// POST /mcp/messages or POST /mcp — JSON-RPC message endpoint (supports both SSE sessions and direct HTTP JSON-RPC)
const handleMessages = async (c: any) => {
  const sessionId =
    c.req.query('sessionId') ||
    c.req.header('x-session-id') ||
    c.req.header('mcp-session-id')

  try {
    const message = (await c.req.json()) as JSONRPCMessage

    if (sessionId && activeTransports.has(sessionId)) {
      const transport = activeTransports.get(sessionId)!
      await transport.handleIncomingMessage(message)
      return c.json({ status: 'accepted' }, 202)
    }

    // Direct HTTP JSON-RPC execution for Streamable HTTP / direct clients
    const directSessionId = sessionId || 'http-direct-session'
    const response = await handleDirectJsonRpc(message, directSessionId)
    return c.json(response)
  } catch (err: any) {
    return c.json({ error: `Failed to process message: ${err.message}` }, 400)
  }
}

mcp.post('/messages', handleMessages)
mcp.post('/', handleMessages)

export default mcp
