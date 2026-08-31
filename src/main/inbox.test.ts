import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Inbox } from './inbox'
import { AppStore } from './store'
import type { KeyValueStore, PersistedState } from './store'
import { DEFAULT_SETTINGS, type PullRequest } from '@shared/types'
import type { InboxSnapshot } from '@shared/ipc'
import { makePullRequest } from '@core/test-factory'

class MemoryStore implements KeyValueStore {
  private state: PersistedState = {
    settings: { ...DEFAULT_SETTINGS, repositories: ['acme/web'] },
    snoozes: {},
    seen: {},
  }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
  }
}

const NOW = '2026-08-10T12:00:00Z'
const CLIENT = (async () => ({})) as never

let store: AppStore
let changes: InboxSnapshot[]

beforeEach(() => {
  store = new AppStore(new MemoryStore())
  changes = []
})

function build(prs: PullRequest[], overrides: Record<string, unknown> = {}) {
  return new Inbox({
    store,
    getClient: () => CLIENT,
    onChange: (snapshot) => changes.push(snapshot),
    now: () => NOW,
    fetchLogin: async () => 'vlad',
    fetchPrs: async () => prs,
    ...overrides,
  })
}

describe('Inbox.refresh', () => {
  it('classifies fetched PRs and counts the ones needing attention', async () => {
    const inbox = build([
      makePullRequest({ id: 'PR_1', buckets: ['review-requested'] }),
      makePullRequest({ id: 'PR_2', authorLogin: 'vlad', buckets: ['author'] }),
    ])

    await inbox.refresh()
    const snapshot = inbox.getSnapshot()

    expect(snapshot.status).toBe('ready')
    expect(snapshot.myLogin).toBe('vlad')
    expect(snapshot.lastUpdatedAt).toBe(NOW)
    expect(snapshot.items.map((item) => item.pr.id)).toEqual(['PR_1', 'PR_2'])
    expect(snapshot.attentionCount).toBe(1)
  })

  it('reports signed-out when there is no client', async () => {
    const inbox = build([], { getClient: () => null })
    await inbox.refresh()
    expect(inbox.getSnapshot().status).toBe('signed-out')
  })

  it('keeps the previous items and reports the error when a fetch fails', async () => {
    // One instance across both refreshes: a two-instance version of this
    // test can never observe "preservation" because there is nothing to
    // preserve from — the second instance starts empty regardless of what
    // the catch block does.
    const fetchPrs = vi
      .fn()
      .mockResolvedValueOnce([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
    const inbox = build([], { fetchPrs })

    await inbox.refresh()
    expect(inbox.getSnapshot().items.map((item) => item.pr.id)).toEqual(['PR_1'])

    await inbox.refresh()

    const snapshot = inbox.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.errorMessage).toBe('rate limit exceeded')
    expect(snapshot.items.map((item) => item.pr.id)).toEqual(['PR_1'])
  })

  it('preserves the last successful update time across a failure', async () => {
    const fetchPrs = vi
      .fn()
      .mockResolvedValueOnce([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
      .mockRejectedValueOnce(new Error('network down'))
    // A frozen now() can't distinguish "preserved" from "recomputed to the
    // same value". Give the failing refresh a different clock reading so a
    // catch block that recomputes lastUpdatedAt is caught red-handed.
    const LATER = '2026-08-10T13:00:00Z'
    const now = vi.fn().mockReturnValueOnce(NOW).mockReturnValue(LATER)
    const inbox = build([], { fetchPrs, now })

    await inbox.refresh()
    await inbox.refresh()

    const snapshot = inbox.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.lastUpdatedAt).toBe(NOW)
    expect(snapshot.items).toHaveLength(1)
  })

  it('notifies subscribers on every state change', async () => {
    const inbox = build([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
    await inbox.refresh()
    expect(changes.map((snapshot) => snapshot.status)).toEqual(['loading', 'ready'])
  })

  it('fetches the viewer login only once', async () => {
    const fetchLogin = vi.fn(async () => 'vlad')
    const inbox = build([], { fetchLogin })
    await inbox.refresh()
    await inbox.refresh()
    expect(fetchLogin).toHaveBeenCalledTimes(1)
  })

  it('clears the cached login and PRs on sign-out so a subsequent sign-in reclassifies against the new user', async () => {
    let client: object | null = CLIENT
    const fetchLogin = vi
      .fn()
      .mockResolvedValueOnce('vlad')
      .mockResolvedValueOnce('other-user')
    // Authored by 'other-user' with changes requested: a clear attention
    // item for 'other-user', invisible to 'vlad'.
    const pr = makePullRequest({
      id: 'PR_1',
      authorLogin: 'other-user',
      reviewDecision: 'CHANGES_REQUESTED',
      buckets: [],
    })
    const inbox = build([pr], {
      getClient: () => client,
      fetchLogin,
    })

    await inbox.refresh()
    expect(inbox.getSnapshot().myLogin).toBe('vlad')
    // Someone else's PR from vlad's point of view: no bucket, no
    // participation -> hidden and filtered out.
    expect(inbox.getSnapshot().items).toEqual([])
    expect(inbox.getSnapshot().attentionCount).toBe(0)

    client = null
    await inbox.refresh()
    expect(inbox.getSnapshot().status).toBe('signed-out')
    expect(inbox.getSnapshot().myLogin).toBeNull()
    expect(inbox.getSnapshot().items).toEqual([])

    client = CLIENT
    await inbox.refresh()

    // The stale 'vlad' login must not have survived sign-out.
    expect(fetchLogin).toHaveBeenCalledTimes(2)
    expect(inbox.getSnapshot().myLogin).toBe('other-user')
    // Now it's "my PR" with changes requested -> visible and attention-worthy.
    expect(inbox.getSnapshot().items.map((item) => item.pr.id)).toEqual(['PR_1'])
    expect(inbox.getSnapshot().attentionCount).toBe(1)
  })

  it('clears a previous error message on sign-out', async () => {
    let client: object | null = CLIENT
    const fetchPrs = vi.fn().mockRejectedValueOnce(new Error('boom'))
    const inbox = build([], { getClient: () => client, fetchPrs })

    await inbox.refresh()
    expect(inbox.getSnapshot().status).toBe('error')
    expect(inbox.getSnapshot().errorMessage).toBe('boom')

    client = null
    await inbox.refresh()

    expect(inbox.getSnapshot().status).toBe('signed-out')
    expect(inbox.getSnapshot().errorMessage).toBeNull()
  })

  it('joins a concurrent refresh instead of starting a second one', async () => {
    const resolvers: Array<(prs: PullRequest[]) => void> = []
    const fetchPrs = vi.fn(
      () =>
        new Promise<PullRequest[]>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const inbox = build([], { fetchPrs })

    const first = inbox.refresh()
    const second = inbox.refresh()

    // Let the microtask queue drain (login lookup, etc.) until the fetch
    // has actually started, then give a concurrent second pass — if the
    // guard is broken — a chance to reach fetchPrs too, so it can't dangle.
    while (resolvers.length === 0) {
      await Promise.resolve()
    }
    await Promise.resolve()
    await Promise.resolve()

    // Resolve whatever fetch(es) actually started, so the test can't hang
    // even if the re-entrancy guard is broken and a second pass was kicked
    // off underneath us.
    const pr = makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })
    resolvers.forEach((resolve) => resolve([pr]))

    await Promise.all([first, second])

    expect(fetchPrs).toHaveBeenCalledTimes(1)
    const snapshot = inbox.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.items.map((item) => item.pr.id)).toEqual(['PR_1'])
  })
})

describe('Inbox.start / stop', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('performs an immediate refresh', async () => {
    vi.useFakeTimers()
    const fetchPrs = vi.fn(async () => [])
    const inbox = build([], { fetchPrs })

    inbox.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchPrs).toHaveBeenCalledTimes(1)
    inbox.stop()
  })

  it('schedules repeat refreshes at the configured poll interval', async () => {
    vi.useFakeTimers()
    const fetchPrs = vi.fn(async () => [])
    const inbox = build([], { fetchPrs }) // MemoryStore defaults to a 5 minute interval

    inbox.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchPrs).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchPrs).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchPrs).toHaveBeenCalledTimes(3)

    inbox.stop()
  })

  it('stop() prevents further ticks', async () => {
    vi.useFakeTimers()
    const fetchPrs = vi.fn(async () => [])
    const inbox = build([], { fetchPrs })

    inbox.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchPrs).toHaveBeenCalledTimes(1)

    inbox.stop()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(fetchPrs).toHaveBeenCalledTimes(1)
  })

  it('calling start() twice does not leave two timers running', async () => {
    vi.useFakeTimers()
    const fetchPrs = vi.fn(async () => [])
    const inbox = build([], { fetchPrs })

    inbox.start()
    await vi.advanceTimersByTimeAsync(0)
    inbox.start()
    await vi.advanceTimersByTimeAsync(0)
    // One immediate refresh per start() call.
    expect(fetchPrs).toHaveBeenCalledTimes(2)

    fetchPrs.mockClear()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    // If the first start() left its timer running, this fires twice.
    expect(fetchPrs).toHaveBeenCalledTimes(1)

    inbox.stop()
  })
})

describe('Inbox.reclassify', () => {
  it('moves a snoozed PR to waiting without refetching', async () => {
    const fetchPrs = vi.fn(async () => [
      makePullRequest({ id: 'PR_1', buckets: ['review-requested'] }),
    ])
    const inbox = build([], { fetchPrs })
    await inbox.refresh()
    expect(inbox.getSnapshot().attentionCount).toBe(1)

    store.snooze('PR_1', 'until-time', NOW, 2)
    inbox.reclassify()

    expect(inbox.getSnapshot().items[0]!.category).toBe('waiting')
    expect(inbox.getSnapshot().attentionCount).toBe(0)
    expect(fetchPrs).toHaveBeenCalledTimes(1)
  })
})
