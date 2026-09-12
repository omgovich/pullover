import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { describeInbox, describePullRequest } from '@core/agent-view'
import { shouldRefreshOnOpen } from '@core/staleness'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { Inbox } from '../inbox'
import type { AppStore } from '../store'

export interface McpServerDeps {
  inbox: Inbox
  store: AppStore
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

function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

const CATEGORIES_HELP = `Categories, in the order the app shows them:
- needs-review: someone asked for your review and you have not reviewed yet.
- new-replies: somebody replied in a review thread you took part in; the reason says how many.
- re-review: you reviewed already and the author pushed new commits or asked again.
- my-pr-action: your own pull request needs you — changes requested, open threads, red CI, merge conflicts, or approved and ready to merge; the reason says which.
- mentioned: you were @-mentioned and have not responded since.
- waiting: nothing is waiting on you (waiting on the author or on other reviewers, or snoozed); only listed when includeWaiting is true.
Pullover reads GitHub; it never comments, reviews or merges. Act on a pull request with your own GitHub tooling, at the url given.`

/** Both snooze tools name a pull request the way everything else does. */
const identifier = {
  repository: z.string().describe('Full name, owner/repo'),
  number: z.number().int().positive().describe('The pull request number'),
}

const LOCAL_NOTE =
  'This is a note inside Pullover on this Mac, undone by unsnooze_pull_request and visible to nobody else. GitHub is not touched: nothing is muted, closed or commented on there.'

function registerTools(server: McpServer, deps: McpServerDeps): void {
  const { inbox, store } = deps
  const now = deps.now ?? ((): string => new Date().toISOString())

  const notFound = (repository: string, number: number): CallToolResult =>
    toolError(
      `Pullover does not know ${repository}#${number}. It only tracks open pull requests involving the signed-in user; call get_inbox first, which refreshes the list when it is stale.`,
    )

  /** The pull request as it reads after a snooze changed its classification. */
  const reportAfterChange = (repository: string, number: number): CallToolResult => {
    inbox.reclassify()
    const item = inbox.findPullRequest(repository, number)
    return item === null ? notFound(repository, number) : toolResult(describePullRequest(item))
  }

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

  server.registerTool(
    'snooze_pull_request',
    {
      title: 'Park a pull request in Pullover',
      description: `Moves a pull request out of the attention sections into "Waiting on others" until there is new activity on it, or for a set number of hours. Use it when the user asks to put something aside, not to tidy the list on your own: parking a pull request is deciding what they do not have to look at. Work you actually finish needs no snooze, because Pullover reclassifies a pull request by itself once the answer it was waiting for lands. ${LOCAL_NOTE}`,
      inputSchema: {
        ...identifier,
        hours: z
          .number()
          .positive()
          .max(24 * 14)
          .optional()
          .describe('Park it for this long instead of until new activity. At most two weeks.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ repository, number, hours }) => {
      const item = inbox.findPullRequest(repository, number)
      if (item === null) return notFound(repository, number)
      if (hours === undefined) store.snooze(item.pr.id, 'until-activity', now())
      else store.snooze(item.pr.id, 'until-time', now(), hours)
      return reportAfterChange(repository, number)
    },
  )

  server.registerTool(
    'unsnooze_pull_request',
    {
      title: 'Put a parked pull request back',
      description: `Undoes snooze_pull_request, returning the pull request to whichever section its state calls for. ${LOCAL_NOTE}`,
      inputSchema: identifier,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ repository, number }) => {
      const item = inbox.findPullRequest(repository, number)
      if (item === null) return notFound(repository, number)
      store.unsnooze(item.pr.id)
      return reportAfterChange(repository, number)
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
    const http = createServer((req, res) => void this.handle(req, res))
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
