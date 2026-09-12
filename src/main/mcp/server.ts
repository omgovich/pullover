import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { describeInbox } from '@core/agent-view'
import { shouldRefreshOnOpen } from '@core/staleness'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { Inbox } from '../inbox'

export interface McpServerDeps {
  inbox: Inbox
  version: string
  now?: () => string
}

export interface McpServerStatus {
  listening: boolean
  /** The bound port, which is what was asked for unless that was 0. */
  port: number | null
  /** Why the server is not listening although it was started, or null. */
  error: string | null
}

const PATH = '/mcp'

export function mcpUrl(port: number): string {
  return `http://127.0.0.1:${port}${PATH}`
}

/**
 * DNS rebinding: a page on the open web can point a hostname at 127.0.0.1
 * and have the browser send requests here. Such requests arrive with that
 * hostname in `Host` and the page's origin in `Origin`; a local client sends
 * a loopback `Host` and no `Origin` at all.
 */
export function refusalFor(headers: IncomingHttpHeaders, port: number): string | null {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`]
  if (headers.host === undefined || !hosts.includes(headers.host)) {
    return `Host ${headers.host ?? '(missing)'} is not this machine`
  }
  if (headers.origin !== undefined && !hosts.some((host) => headers.origin === `http://${host}`)) {
    return `Origin ${headers.origin} is not this machine`
  }
  return null
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function rpcError(message: string): unknown {
  return { jsonrpc: '2.0', error: { code: -32000, message }, id: null }
}

function toolResult(payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  }
}

const CATEGORIES_HELP = `Categories, in the order the app shows them:
- needs-review: someone asked for your review and you have not reviewed yet.
- new-replies: somebody replied in a review thread you took part in; the reason says how many.
- re-review: you reviewed already and the author pushed new commits or asked again.
- my-pr-action: your own pull request needs you — changes requested, open threads, red CI, merge conflicts, or approved and ready to merge; the reason says which.
- mentioned: you were @-mentioned and have not responded since.
- waiting: nothing is waiting on you (waiting on the author or on other reviewers, or snoozed); only listed when includeWaiting is true.
Pullover reads GitHub; it never comments, reviews or merges. Act on a pull request with your own GitHub tooling, at the url given.`

function registerTools(server: McpServer, deps: McpServerDeps): void {
  const { inbox } = deps
  const now = deps.now ?? ((): string => new Date().toISOString())

  server.registerTool(
    'get_inbox',
    {
      title: 'Pull requests waiting on you',
      description: `The pull requests that need the signed-in user, grouped into sections by why, longest-waiting first. Refreshes from GitHub first when the last fetch is more than a minute old, so the answer is current (see lastUpdatedAt). When notice is not null, relay it.\n\n${CATEGORIES_HELP}`,
      inputSchema: {
        includeWaiting: z
          .boolean()
          .optional()
          .describe('Also list the pull requests waiting on other people. Default false.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ includeWaiting }) => {
      // The popup's own rule for spending a fetch on open, so an agent and a
      // click get the same freshness for the same price.
      if (shouldRefreshOnOpen(inbox.getSnapshot(), now())) await inbox.refresh()
      return toolResult(
        describeInbox(inbox.getSnapshot(), { includeWaiting: includeWaiting ?? false }),
      )
    },
  )
}

export class PulloverMcpServer {
  private http: Server | null = null
  private port: number | null = null
  private error: string | null = null

  constructor(private readonly deps: McpServerDeps) {}

  status(): McpServerStatus {
    return { listening: this.http !== null, port: this.port, error: this.error }
  }

  /** Resolves once the outcome is known; a port that cannot be bound is reported by `status()`, not thrown. */
  async start(port: number): Promise<void> {
    await this.stop()
    this.error = null
    const http = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => {
      http.once('error', (error: NodeJS.ErrnoException) => {
        this.error =
          error.code === 'EADDRINUSE'
            ? `Port ${port} is in use — quit whatever holds it, then turn this off and on.`
            : error.message
        resolve()
      })
      http.listen(port, '127.0.0.1', () => {
        const address = http.address()
        this.port = typeof address === 'object' && address !== null ? address.port : port
        this.http = http
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const http = this.http
    this.http = null
    this.port = null
    if (http === null) return
    http.closeAllConnections()
    await new Promise<void>((resolve) => http.close(() => resolve()))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const port = this.port ?? 0
    const refusal = refusalFor(req.headers, port)
    if (refusal !== null) {
      sendJson(res, 403, rpcError(refusal))
      return
    }
    const url = new URL(req.url ?? '/', mcpUrl(port))
    if (url.pathname !== PATH) {
      sendJson(res, 404, rpcError(`Nothing here; the MCP endpoint is ${PATH}`))
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, rpcError('Only POST is served; this server holds no sessions'), {
        Allow: 'POST',
      })
      return
    }

    // A fresh server per request is what stateless mode wants: nothing to
    // look up, nothing to leak. Building one is a handful of closures.
    const server = new McpServer({ name: 'pullover', version: this.deps.version })
    registerTools(server, this.deps)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch (error) {
      console.error('[mcp] request failed', error)
      if (!res.headersSent) {
        sendJson(res, 500, rpcError(error instanceof Error ? error.message : String(error)))
      }
    }
  }
}
