import { describeInbox } from '@core/agent-view'
import { shouldRefreshOnOpen } from '@core/staleness'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { Inbox } from '../inbox'

export interface McpServerDeps {
  inbox: Inbox
  version: string
  now?: () => string
}

function toolResult(payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  }
}

const GET_INBOX_TOOL_DESCRIPTION = `Pullover's inbox: the open pull requests waiting on the user, grouped into sections by why they are waiting. Call it when the user asks what needs their attention on GitHub, what to review next, or whether anything is blocked on them.

Each section is longest-waiting first — except "waiting", which has nobody waiting and is ordered by latest activity. Pullover refreshes from GitHub when its last fetch is over a minute old, so the list is current as of lastUpdatedAt. When notice is not null, the list is not the whole answer — signed out, a fetch that failed, or a first one still running — so relay the notice to the user.

Categories, in the order the app shows them:
- needs-review: somebody asked the user for review and they have not reviewed yet.
- new-replies: somebody replied in a review thread the user took part in; the reason says how many.
- re-review: the user reviewed already and the author pushed new commits or asked again.
- my-pr-action: the user's own pull request needs them — changes requested, open threads, red CI, merge conflicts, or approved and ready to merge; the reason says which.
- mentioned: the user was @-mentioned and has not responded since.
- waiting: nothing is waiting on the user — it is on the author or on other reviewers, or it is snoozed; listed only when includeWaiting is true.

Pullover reads GitHub; it never comments, reviews or merges. Act on a pull request with your own GitHub tooling — the \`gh\` CLI, say — at the url given.`

export function registerTools(server: McpServer, deps: McpServerDeps): void {
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
