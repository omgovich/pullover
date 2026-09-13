import { describeInbox, describePullRequest } from '@core/agent-view'
import { shouldRefreshOnOpen } from '@core/staleness'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ClassifiedPullRequest } from '@shared/types'
import { z } from 'zod'
import type { Inbox } from '../inbox'
import type { AppStore } from '../store'

export interface McpServerDeps {
  inbox: Inbox
  store: AppStore
  version: string
  now?: () => string
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

/** Both snooze tools name a pull request the way everything else does. */
const identifier = {
  repository: z.string().describe('Full name, owner/repo'),
  number: z.number().int().positive().describe('The pull request number'),
}

const LOCAL_NOTE =
  'This is a note inside Pullover on this Mac, visible to nobody else. GitHub is not touched: nothing is muted, closed or commented on there.'

export function registerTools(server: McpServer, deps: McpServerDeps): void {
  const { inbox, store } = deps
  const now = deps.now ?? ((): string => new Date().toISOString())

  const notFound = (repository: string, number: number): CallToolResult =>
    // Signed out, `findPullRequest` returns null for everything, and pointing
    // the agent at `get_inbox` would send it looking for a list nobody has.
    toolError(
      inbox.getSnapshot().status === 'signed-out'
        ? 'Pullover is signed out, so it knows no pull requests at all. Sign in from its menu-bar window first.'
        : `Pullover does not know ${repository}#${number}. It only tracks open pull requests involving the signed-in user; call get_inbox first, which refreshes the list when it is stale.`,
    )

  /**
   * A pull request the classifier hides takes no snooze: `classify` returns
   * before the snooze is ever consulted. Writing one anyway would report no
   * effect and then quietly take hold the day the pull request reappears.
   *
   * Three things are hidden, not just drafts — an own pull request that is
   * approved with auto-merge armed, and one the user is simply not involved
   * in, are the other two — so only a draft may be named as one.
   */
  const refuseIfHidden = (item: ClassifiedPullRequest): CallToolResult | null => {
    if (item.category !== 'hidden') return null
    const name = `${item.pr.repository}#${item.pr.number}`
    return toolError(
      item.pr.isDraft
        ? `${name} is a draft, and Pullover does not park drafts: they are out of the inbox already. It will appear once it is marked ready for review.`
        : `${name} is not in the inbox — nothing about it is waiting on the user — so there is nothing to park. Call get_inbox to see what is.`,
    )
  }

  /** The pull request as it reads after a snooze changed its classification. */
  const reportAfterChange = (repository: string, number: number): CallToolResult => {
    inbox.reclassify()
    const item = inbox.findPullRequest(repository, number)
    return item === null ? notFound(repository, number) : toolResult(describePullRequest(item))
  }

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

  server.registerTool(
    'snooze_pull_request',
    {
      title: 'Park a pull request in Pullover',
      description: `Moves a pull request out of the attention sections into "Waiting on others", either for a number of hours or — with no hours — until it wakes on its own. With no hours it wakes on exactly two things: somebody replying in an unresolved review thread the user took part in, or a new commit. A new conversation comment, a fresh thread the user is not in, or a CI result does not wake it. Use it when the user asks to put something aside, not to tidy the list on your own: parking a pull request is deciding what they do not have to look at. Work you actually finish needs no snooze, because Pullover reclassifies a pull request by itself once the answer it was waiting for lands. Undo it with unsnooze_pull_request. ${LOCAL_NOTE}`,
      inputSchema: {
        ...identifier,
        hours: z
          .number()
          .int()
          .min(1)
          .max(24 * 14)
          .optional()
          .describe(
            'Whole hours to park it for, 1 to 336. A park with hours ends on the clock alone — a reply or a new commit does not cut it short. Leave it out and it is parked with no deadline instead, until one of those wakes it.',
          ),
      },
      // Not idempotent: a repeat moves the deadline, or re-bases the wait on
      // new activity, so a client must not retry it on its own.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ repository, number, hours }) => {
      const item = inbox.findPullRequest(repository, number)
      if (item === null) return notFound(repository, number)
      const hidden = refuseIfHidden(item)
      if (hidden !== null) return hidden
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
    // No hidden check, unlike snoozing: a pull request that went to draft
    // while parked still carries the snooze, and refusing here would leave it
    // there to take hold the day it comes back — the very thing the check on
    // the other side exists to prevent.
    async ({ repository, number }) => {
      const item = inbox.findPullRequest(repository, number)
      if (item === null) return notFound(repository, number)
      store.unsnooze(item.pr.id)
      return reportAfterChange(repository, number)
    },
  )
}
