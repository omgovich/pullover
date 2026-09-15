import { request } from 'node:http'
import { makeComment, makePullRequest, makeReview, makeThread } from '@core/test-factory'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { DEFAULT_SETTINGS, type PullRequest } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Inbox } from '../inbox'
import { AppStore, type KeyValueStore, type PersistedState } from '../store'
import { mcpUrl, PulloverMcpServer, refusalFor } from './server'

class MemoryStore implements KeyValueStore {
  private state: PersistedState = { settings: { ...DEFAULT_SETTINGS }, snoozes: {} }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
  }
}

const NOW = '2026-08-10T12:00:00Z'
/** One minute and a second later: past `STALE_AFTER_MS` in src/core/staleness.ts. */
const LATER = '2026-08-10T12:01:01Z'
const CLIENT = (async () => ({})) as never

const openThread = makeThread({
  id: 'T_1',
  comments: [makeComment('bob', '2026-08-09T10:00:00Z', 'Rename this?')],
})

function fixtures(): PullRequest[] {
  return [
    makePullRequest({
      id: 'PR_1',
      repository: 'acme/web',
      number: 1,
      title: 'Add search',
      buckets: ['review-requested'],
      reviewRequestedAt: '2026-08-09T09:00:00Z',
    }),
    makePullRequest({
      id: 'PR_7',
      repository: 'acme/api',
      number: 7,
      title: 'Retry writes',
      authorLogin: 'vlad',
      buckets: ['author'],
      reviewThreads: [openThread],
    }),
    makePullRequest({
      id: 'PR_3',
      repository: 'acme/web',
      number: 3,
      title: 'Tidy tests',
      buckets: ['involves'],
      reviews: [makeReview('vlad', '2026-08-08T10:00:00Z', { state: 'COMMENTED' })],
    }),
  ]
}

let prs: PullRequest[]
let store: AppStore
let now: string
let fetches: number
/** Parks the next fetch, so a pass can be left in flight on purpose. */
let hold: Promise<void> | null
let inbox: Inbox
let server: PulloverMcpServer

beforeEach(async () => {
  prs = fixtures()
  now = NOW
  fetches = 0
  hold = null
  store = new AppStore(new MemoryStore())
  inbox = new Inbox({
    store,
    getClient: () => CLIENT,
    onChange: () => {},
    now: () => now,
    fetchLogin: async () => 'vlad',
    fetchPrs: async () => {
      fetches += 1
      if (hold !== null) await hold
      return { prs, restrictedOrgs: [] }
    },
  })
  await inbox.refresh()
  server = new PulloverMcpServer({ inbox, store, version: '0.0.0-test', now: () => now })
  await server.start(0)
})

afterEach(async () => {
  await server.stop()
})

function port(): number {
  const bound = server.status().port
  if (bound === null) throw new Error('server is not listening')
  return bound
}

async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{
  isError: boolean
  text: string
  structured: unknown
}> {
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl(port()))))
  try {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as { type: string; text?: string }[]
    return {
      isError: result.isError === true,
      text: content[0]?.text ?? '',
      structured: result.structuredContent,
    }
  } finally {
    await client.close()
  }
}

function rawPost(
  headers: Record<string, string>,
  method = 'POST',
  path = '/mcp',
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: port(),
        path,
        method,
        // Node would otherwise overwrite the Host header with the real one.
        setHost: false,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Host: `127.0.0.1:${port()}`,
          ...headers,
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }))
  })
}

describe('tools/list', () => {
  it('offers the three tools', async () => {
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl(port()))))
    try {
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).toEqual([
        'get_inbox',
        'snooze_pull_request',
        'unsnooze_pull_request',
      ])
    } finally {
      await client.close()
    }
  })
})

describe('get_inbox', () => {
  it('returns the attention sections by default', async () => {
    const { isError, structured } = await callTool('get_inbox')
    expect(isError).toBe(false)
    const inboxView = structured as { sections: { category: string }[]; myLogin: string }
    expect(inboxView.myLogin).toBe('vlad')
    expect(inboxView.sections.map((s) => s.category)).toEqual(['needs-review', 'my-pr-action'])
  })

  it('adds the waiting section when asked', async () => {
    const { structured } = await callTool('get_inbox', { includeWaiting: true })
    const inboxView = structured as { sections: { category: string }[] }
    expect(inboxView.sections.map((s) => s.category)).toEqual([
      'needs-review',
      'my-pr-action',
      'waiting',
    ])
  })

  it('also puts the JSON in the text content for clients that ignore structured output', async () => {
    const { text } = await callTool('get_inbox')
    expect(JSON.parse(text)).toMatchObject({ myLogin: 'vlad' })
  })

  it('answers from the snapshot while it is fresh', async () => {
    await callTool('get_inbox')
    expect(fetches).toBe(1)
  })

  it('waits for a pass in flight rather than answering from the list it replaces', async () => {
    now = LATER
    prs = [makePullRequest({ id: 'PR_50', number: 50, buckets: ['review-requested'] })]
    let release = (): void => {}
    hold = new Promise<void>((resolve) => {
      release = resolve
    })

    // Released exactly when the handler reaches the wait, never on a timer: a
    // slow connect would otherwise let the fetch land first, and the test
    // would pass with the wait deleted.
    let waited = false
    const realWhenIdle = inbox.whenIdle.bind(inbox)
    inbox.whenIdle = (): Promise<void> => {
      waited = true
      return realWhenIdle()
    }

    const pass = inbox.refresh()
    const answer = callTool('get_inbox')
    for (let i = 0; !waited && i < 300; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(waited).toBe(true)
    release()

    const { structured } = await answer
    await pass

    const inboxView = structured as {
      status: string
      sections: { pullRequests: { number: number }[] }[]
    }
    expect(inboxView.status).toBe('ready')
    expect(inboxView.sections.flatMap((s) => s.pullRequests.map((p) => p.number))).toEqual([50])
    // The pass it waited for, and no second one on top.
    expect(fetches).toBe(2)
  })

  it('refreshes first once the snapshot is stale, like opening the popup does', async () => {
    now = LATER
    prs = [makePullRequest({ id: 'PR_50', number: 50, buckets: ['review-requested'] })]
    const { structured } = await callTool('get_inbox')
    expect(fetches).toBe(2)
    const inboxView = structured as {
      lastUpdatedAt: string
      sections: { pullRequests: { number: number }[] }[]
    }
    expect(inboxView.lastUpdatedAt).toBe(LATER)
    expect(inboxView.sections.flatMap((s) => s.pullRequests.map((p) => p.number))).toEqual([50])
  })
})

describe('get_inbox when the app cannot answer properly', () => {
  // The spec promises an agent a usable answer while signed out, rather than
  // a refused connection: the server runs whether or not anyone is signed in.
  it('says so, and points at the window, while signed out', async () => {
    const ownStore = new AppStore(new MemoryStore())
    const signedOut = new Inbox({
      store: ownStore,
      getClient: () => null,
      onChange: () => {},
      now: () => now,
      fetchLogin: async () => 'vlad',
      fetchPrs: async () => ({ prs: [], restrictedOrgs: [] }),
    })
    await signedOut.refresh()

    const other = new PulloverMcpServer({
      inbox: signedOut,
      store: ownStore,
      version: '0.0.0-test',
      now: () => now,
    })
    await other.start(0)
    const bound = other.status().port as number
    try {
      const client = new Client({ name: 'test', version: '0' })
      await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl(bound))))
      try {
        const result = await client.callTool({ name: 'get_inbox', arguments: {} })
        expect(result.isError).not.toBe(true)
        expect(result.structuredContent).toMatchObject({
          status: 'signed-out',
          myLogin: null,
          sections: [],
        })
        expect((result.structuredContent as { notice: string }).notice).toMatch(/sign in/i)
      } finally {
        await client.close()
      }
    } finally {
      await other.stop()
    }
  })

  // Two agents asking while a pass is already running must both get the
  // result of that pass. Counting fetches is not enough to prove it: while a
  // pass runs the status is `loading`, which suppresses a fetch on its own.
  it('serves callers who arrive during a pass from that one fetch', async () => {
    now = LATER
    prs = [makePullRequest({ id: 'PR_50', number: 50, buckets: ['review-requested'] })]
    let release = (): void => {}
    hold = new Promise<void>((resolve) => {
      release = resolve
    })

    let waits = 0
    const realWhenIdle = inbox.whenIdle.bind(inbox)
    inbox.whenIdle = (): Promise<void> => {
      waits += 1
      return realWhenIdle()
    }

    const pass = inbox.refresh()
    const both = Promise.all([callTool('get_inbox'), callTool('get_inbox')])
    // Released only once both handlers have reached the wait, never on a
    // timer: otherwise a slow connect lets the fetch land first and the test
    // passes with the wait deleted.
    for (let i = 0; waits < 2 && i < 300; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(waits).toBe(2)
    release()

    const [first, second] = await both
    await pass

    for (const answer of [first, second]) {
      const view = answer.structured as {
        status: string
        sections: { pullRequests: { number: number }[] }[]
      }
      expect(view.status).toBe('ready')
      expect(view.sections.flatMap((s) => s.pullRequests.map((p) => p.number))).toEqual([50])
    }
    // The pass they waited for, and nothing on top of it.
    expect(fetches).toBe(2)
  })
})

describe('snooze tools', () => {
  it('parks a pull request until new activity and reports its new state', async () => {
    const { isError, structured } = await callTool('snooze_pull_request', {
      repository: 'acme/web',
      number: 1,
    })
    expect(isError).toBe(false)
    expect(store.getSnoozes()['PR_1']).toMatchObject({ type: 'until-activity', snoozedAt: NOW })
    expect(structured).toMatchObject({
      number: 1,
      category: 'waiting',
      reason: 'Snoozed',
      isSnoozed: true,
    })
  })

  it('takes it out of the attention sections straight away', async () => {
    await callTool('snooze_pull_request', { repository: 'acme/web', number: 1 })
    const { structured } = await callTool('get_inbox')
    const inboxView = structured as { sections: { pullRequests: { number: number }[] }[] }
    expect(inboxView.sections.flatMap((s) => s.pullRequests.map((p) => p.number))).not.toContain(1)
  })

  it('parks it for a number of hours instead, when given one', async () => {
    await callTool('snooze_pull_request', { repository: 'acme/web', number: 1, hours: 4 })
    expect(store.getSnoozes()['PR_1']).toMatchObject({
      type: 'until-time',
      until: '2026-08-10T16:00:00.000Z',
    })
  })

  it('matches the repository name whatever its case', async () => {
    const { isError } = await callTool('snooze_pull_request', {
      repository: 'ACME/Web',
      number: 1,
    })
    expect(isError).toBe(false)
    expect(store.getSnoozes()['PR_1']).toBeDefined()
  })

  it('unsnoozes, putting the pull request back where it was', async () => {
    await callTool('snooze_pull_request', { repository: 'acme/web', number: 1 })
    const { isError, structured } = await callTool('unsnooze_pull_request', {
      repository: 'acme/web',
      number: 1,
    })
    expect(isError).toBe(false)
    expect(store.getSnoozes()['PR_1']).toBeUndefined()
    expect(structured).toMatchObject({ category: 'needs-review', isSnoozed: false })
  })

  // The mirror of the refusal below: a pull request parked while it was in
  // the inbox and turned to draft afterwards still carries the snooze, and
  // this is the only way left to clear it — the window does not draw a draft,
  // so its context menu is out of reach.
  it('unsnoozes a pull request that went to draft while it was parked', async () => {
    await callTool('snooze_pull_request', { repository: 'acme/web', number: 1, hours: 336 })
    expect(store.getSnoozes()['PR_1']).toBeDefined()

    prs = prs.map((pr) => (pr.id === 'PR_1' ? { ...pr, isDraft: true } : pr))
    now = LATER
    await inbox.refresh()

    const { isError } = await callTool('unsnooze_pull_request', {
      repository: 'acme/web',
      number: 1,
    })
    expect(isError).toBe(false)
    expect(store.getSnoozes()).toEqual({})
  })

  // The `idempotentHint: true` the tool advertises: a client may retry it.
  it('unsnoozes a pull request that was never parked, without complaining', async () => {
    const { isError, structured } = await callTool('unsnooze_pull_request', {
      repository: 'acme/web',
      number: 1,
    })
    expect(isError).toBe(false)
    expect(structured).toMatchObject({ category: 'needs-review', isSnoozed: false })
  })

  // `classify` returns early for a draft, before the snooze check, so the
  // store would keep a snooze that does nothing — until the draft is marked
  // ready and it silently takes hold.
  it('refuses a draft, rather than writing a snooze that cannot take effect', async () => {
    prs = [
      makePullRequest({
        id: 'PR_D',
        repository: 'acme/web',
        number: 5,
        isDraft: true,
        buckets: ['review-requested'],
      }),
    ]
    await inbox.refresh()

    const { isError, text } = await callTool('snooze_pull_request', {
      repository: 'acme/web',
      number: 5,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(/draft/i)
    expect(store.getSnoozes()).toEqual({})
  })

  // `classify` hides three things, and only one of them is a draft. Saying
  // "draft" about the other two would have the agent repeat it to the user.
  it('refuses a hidden pull request that is not a draft without calling it one', async () => {
    prs = [
      makePullRequest({
        id: 'PR_H',
        repository: 'acme/api',
        number: 8,
        authorLogin: 'vlad',
        buckets: ['author'],
        reviewDecision: 'APPROVED',
        hasAutoMerge: true,
        reviews: [makeReview('bob', '2026-08-09T10:00:00Z', { state: 'APPROVED' })],
      }),
    ]
    await inbox.refresh()

    const { isError, text } = await callTool('snooze_pull_request', {
      repository: 'acme/api',
      number: 8,
    })
    expect(isError).toBe(true)
    expect(text).not.toMatch(/draft/i)
    expect(text).toMatch(/not in the inbox/i)
    expect(store.getSnoozes()).toEqual({})
  })

  // Zero rather than a fraction: a fraction is refused by the whole-hours
  // rule on its own, so it would pass with no minimum at all — and with none,
  // zero writes a deadline that has already gone by.
  it('refuses a park shorter than the one hour it counts in', async () => {
    const { isError } = await callTool('snooze_pull_request', {
      repository: 'acme/web',
      number: 1,
      hours: 0,
    })
    expect(isError).toBe(true)
    expect(store.getSnoozes()).toEqual({})
  })

  it('refuses a fraction of an hour, which the minimum alone would let through', async () => {
    const { isError } = await callTool('snooze_pull_request', {
      repository: 'acme/web',
      number: 1,
      hours: 2.5,
    })
    expect(isError).toBe(true)
    expect(store.getSnoozes()).toEqual({})
  })

  it('tells clients a snooze is not safe to retry, because it moves the deadline', async () => {
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl(port()))))
    const { tools } = await client.listTools()
    await client.close()
    const byName = new Map(tools.map((tool) => [tool.name, tool]))
    expect(byName.get('snooze_pull_request')?.annotations?.idempotentHint).toBe(false)
    expect(byName.get('unsnooze_pull_request')?.annotations?.idempotentHint).toBe(true)
  })

  it('says it is signed out rather than sending the agent to an empty inbox', async () => {
    const ownStore = new AppStore(new MemoryStore())
    const signedOut = new Inbox({
      store: ownStore,
      getClient: () => null,
      onChange: () => {},
      now: () => now,
      fetchLogin: async () => 'vlad',
      fetchPrs: async () => ({ prs: [], restrictedOrgs: [] }),
    })
    await signedOut.refresh()

    const other = new PulloverMcpServer({
      inbox: signedOut,
      store: ownStore,
      version: '0.0.0-test',
      now: () => now,
    })
    await other.start(0)
    try {
      const client = new Client({ name: 'test', version: '0' })
      await client.connect(
        new StreamableHTTPClientTransport(new URL(mcpUrl(other.status().port as number))),
      )
      const result = await client.callTool({
        name: 'snooze_pull_request',
        arguments: { repository: 'acme/web', number: 1 },
      })
      await client.close()
      const content = result.content as { text?: string }[]
      expect(result.isError).toBe(true)
      expect(content[0]?.text).toMatch(/signed out/i)
    } finally {
      await other.stop()
    }
  })

  it('refuses a pull request it has never seen, and writes nothing', async () => {
    const { isError, text } = await callTool('snooze_pull_request', {
      repository: 'acme/web',
      number: 404,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(/only tracks open pull requests/i)
    expect(store.getSnoozes()).toEqual({})
  })

  // Nothing validates the length downstream: `AppStore.snooze` would happily
  // date a deadline years out.
  it('refuses an absurd snooze length before it reaches the store', async () => {
    const { isError } = await callTool('snooze_pull_request', {
      repository: 'acme/web',
      number: 1,
      hours: 100_000,
    })
    expect(isError).toBe(true)
    expect(store.getSnoozes()).toEqual({})
  })

  it('never refreshes: a bulk triage must not cost a fetch per pull request', async () => {
    now = LATER
    await callTool('snooze_pull_request', { repository: 'acme/web', number: 1 })
    await callTool('unsnooze_pull_request', { repository: 'acme/web', number: 1 })
    expect(fetches).toBe(1)
  })
})

describe('the HTTP surface', () => {
  it('refuses a foreign Host with a JSON-RPC error', async () => {
    const { status, body } = await rawPost({ Host: 'evil.example' })
    expect(status).toBe(403)
    expect(JSON.parse(body)).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } })
  })

  it('refuses a foreign Origin', async () => {
    const { status } = await rawPost({ Origin: 'http://evil.example' })
    expect(status).toBe(403)
  })

  it('accepts a local Origin', async () => {
    const { status } = await rawPost({ Origin: `http://localhost:${port()}` })
    expect(status).toBe(200)
  })

  it('answers 405 to GET on /mcp', async () => {
    const { status } = await rawPost({}, 'GET')
    expect(status).toBe(405)
  })

  it('accepts a Host header in another case, which HTTP says is the same host', async () => {
    const { status } = await rawPost({ Host: `LOCALHOST:${port()}` })
    expect(status).toBe(200)
  })

  // `new URL` throws on these, and the throw used to escape the handler as an
  // unhandled rejection, leaving the connection hanging with no reply at all.
  it('answers 400 to a request target it cannot parse', async () => {
    const { status, body } = await rawPost({}, 'POST', '//[')
    expect(status).toBe(400)
    expect(JSON.parse(body)).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } })
  })

  it('answers 404 off /mcp', async () => {
    const { status } = await rawPost({}, 'POST', '/')
    expect(status).toBe(404)
  })
})

describe('lifecycle', () => {
  it('reports a port that is already taken instead of throwing', async () => {
    const second = new PulloverMcpServer({ inbox, store, version: '0.0.0-test' })
    await second.start(port())
    expect(second.status()).toEqual({
      listening: false,
      port: null,
      error: expect.stringMatching(/in use/),
    })
    await second.stop()
  })

  it('leaves nothing listening when a stop lands during a bind', async () => {
    const second = new PulloverMcpServer({ inbox, store, version: '0.0.0-test' })
    // Both calls made before either settles, which is what a double-click on
    // the settings switch does.
    const starting = second.start(0)
    const stopping = second.stop()
    await Promise.all([starting, stopping])
    expect(second.status()).toEqual({ listening: false, port: null, error: null })
  })

  it('does not report a conflict against a listener of its own', async () => {
    // A port known to be free, so the two starts below race for the same one.
    const probe = new PulloverMcpServer({ inbox, store, version: '0.0.0-test' })
    await probe.start(0)
    const free = probe.status().port as number
    await probe.stop()

    const second = new PulloverMcpServer({ inbox, store, version: '0.0.0-test' })
    await Promise.all([second.start(free), second.start(free)])
    expect(second.status()).toEqual({ listening: true, port: free, error: null })
    await second.stop()
  })

  it('stops twice without complaint', async () => {
    await server.stop()
    await server.stop()
    expect(server.status().listening).toBe(false)
  })

  it('clears an earlier bind failure once a start succeeds', async () => {
    const second = new PulloverMcpServer({ inbox, store, version: '0.0.0-test' })
    await second.start(port())
    expect(second.status().error).toMatch(/in use/)
    await second.start(0)
    expect(second.status()).toMatchObject({ listening: true, error: null })
    await second.stop()
  })

  it('forgets a bind failure once it is stopped', async () => {
    const second = new PulloverMcpServer({ inbox, store, version: '0.0.0-test' })
    await second.start(port())
    expect(second.status().error).toMatch(/in use/)
    await second.stop()
    // Otherwise Settings reports a conflict for a server that is simply off.
    expect(second.status().error).toBeNull()
  })

  it('is not listening after stop', async () => {
    await server.stop()
    expect(server.status().listening).toBe(false)
    expect(server.status().port).toBeNull()
  })
})

describe('refusalFor', () => {
  it('allows the loopback hosts with the right port and nothing else', () => {
    expect(refusalFor({ host: '127.0.0.1:7855' }, 7855)).toBeNull()
    expect(refusalFor({ host: 'localhost:7855' }, 7855)).toBeNull()
    expect(refusalFor({ host: '127.0.0.1:7856' }, 7855)).toMatch(/Host/)
    expect(refusalFor({}, 7855)).toMatch(/Host/)
    // Case-insensitive per RFC 9110, so a legitimate client is not refused.
    expect(refusalFor({ host: 'LocalHost:7855' }, 7855)).toBeNull()
  })

  it('allows a missing Origin and a loopback one, and refuses any other', () => {
    expect(refusalFor({ host: 'localhost:7855' }, 7855)).toBeNull()
    expect(refusalFor({ host: 'localhost:7855', origin: 'http://127.0.0.1:7855' }, 7855)).toBeNull()
    expect(refusalFor({ host: 'localhost:7855', origin: 'https://github.com' }, 7855)).toMatch(
      /Origin/,
    )
    expect(refusalFor({ host: 'localhost:7855', origin: 'HTTP://LOCALHOST:7855' }, 7855)).toBeNull()
  })
})
