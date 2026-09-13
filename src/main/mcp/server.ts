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
  // Lowercased because both fields are case-insensitive (RFC 9110), and a
  // client sending `LOCALHOST` is a legitimate one. The allowlist is fixed,
  // so folding case lets nothing new through.
  const host = headers.host?.toLowerCase()
  if (host === undefined || !hosts.includes(host)) {
    return `Host ${headers.host ?? '(missing)'} is not this machine`
  }
  const origin = headers.origin?.toLowerCase()
  if (origin !== undefined && !hosts.some((each) => origin === `http://${each}`)) {
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

const GET_INBOX_TOOL_DESCRIPTION = `Pullover's inbox: the open pull requests waiting on the user, grouped into sections by why they are waiting. Call it when the user asks what needs their attention on GitHub, what to review next, or whether anything is blocked on them.

Each section is longest-waiting first — except "waiting", which has nobody waiting and is ordered by latest activity. Pullover refreshes from GitHub when its last fetch is over a minute old, so the list is current as of lastUpdatedAt. When notice is not null, something is wrong with the list itself; relay it to the user.

Categories, in the order the app shows them:
- needs-review: somebody asked the user for review and they have not reviewed yet.
- new-replies: somebody replied in a review thread the user took part in; the reason says how many.
- re-review: the user reviewed already and the author pushed new commits or asked again.
- my-pr-action: the user's own pull request needs them — changes requested, open threads, red CI, merge conflicts, or approved and ready to merge; the reason says which.
- mentioned: the user was @-mentioned and has not responded since.
- waiting: nothing is waiting on the user — it is on the author or on other reviewers, or it is snoozed; listed only when includeWaiting is true.

Pullover reads GitHub; it never comments, reviews or merges. Act on a pull request with your own GitHub tooling — the \`gh\` CLI, say — at the url given.`

function registerTools(server: McpServer, deps: McpServerDeps): void {
  const { inbox } = deps
  const now = deps.now ?? ((): string => new Date().toISOString())

  server.registerTool(
    'get_inbox',
    {
      title: 'Pull requests waiting on the user',
      description: GET_INBOX_TOOL_DESCRIPTION,
      inputSchema: {
        includeWaiting: z
          .boolean()
          .optional()
          .describe(
            "Also list what is waiting on somebody else — the user's own pull requests out for review, ones where the ball is with the author, and anything snoozed. Default false.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ includeWaiting }) => {
      // A pass already running is the fresh answer on its way, and the app
      // reports one as `loading` with the list it is about to replace still
      // in place. A human sees a spinner and waits; an agent would take that
      // list — or, at launch, an empty one — for the answer.
      await inbox.whenIdle()
      // Then the popup's own rule, so an agent and a click cost the same.
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
  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly deps: McpServerDeps) {}

  status(): McpServerStatus {
    return { listening: this.http !== null, port: this.port, error: this.error }
  }

  /** Resolves once the outcome is known; a port that cannot be bound is reported by `status()`, not thrown. */
  start(port: number): Promise<void> {
    return this.enqueue(async () => {
      await this.closeHttp()
      this.error = null
      await this.bind(port)
    })
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.closeHttp())
  }

  /**
   * `listen` finishes a turn after the call, so an unserialised pair could
   * leave a listener running behind a setting that says off, or have a start
   * report a bind conflict against a listener of its own. Neither step ever
   * rejects, so the chain cannot be poisoned.
   */
  private enqueue(step: () => Promise<void>): Promise<void> {
    this.pending = this.pending.then(step)
    return this.pending
  }

  private bind(port: number): Promise<void> {
    const http = createServer((req, res) => {
      // `handle` is async, so anything it throws would otherwise surface as
      // an unhandled rejection and leave the connection hanging unanswered.
      void this.handle(req, res).catch((error: unknown) => {
        console.error('[mcp] request failed', error)
        if (res.headersSent) res.end()
        else sendJson(res, 500, rpcError('The MCP server failed to handle the request'))
      })
    })
    return new Promise<void>((resolve) => {
      // Stays attached past a successful listen: an accept that fails later
      // would otherwise be an unhandled 'error' event, which ends the app.
      http.on('error', (error: NodeJS.ErrnoException) => {
        if (this.http !== null) {
          console.error('[mcp] server error', error)
          return
        }
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

  private async closeHttp(): Promise<void> {
    const http = this.http
    this.http = null
    this.port = null
    this.error = null
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
    let pathname: string
    try {
      pathname = new URL(req.url ?? '/', mcpUrl(port)).pathname
    } catch {
      sendJson(res, 400, rpcError('Malformed request target'))
      return
    }
    if (pathname !== PATH) {
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
