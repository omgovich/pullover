import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    const inbox = build([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
    await inbox.refresh()

    const failing = build([], {
      fetchPrs: async () => {
        throw new Error('rate limit exceeded')
      },
    })
    await failing.refresh()

    expect(failing.getSnapshot().status).toBe('error')
    expect(failing.getSnapshot().errorMessage).toBe('rate limit exceeded')
  })

  it('preserves the last successful update time across a failure', async () => {
    const fetchPrs = vi
      .fn()
      .mockResolvedValueOnce([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
      .mockRejectedValueOnce(new Error('network down'))
    const inbox = build([], { fetchPrs })

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
