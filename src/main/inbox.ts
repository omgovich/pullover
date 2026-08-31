import { classifyAll, countAttention } from '@core/classify'
import type { InboxSnapshot } from '@shared/ipc'
import type { PullRequest } from '@shared/types'
import {
  fetchPullRequests,
  fetchViewerLogin,
  type GraphQLClient,
} from './github/fetch-prs'
import type { AppStore } from './store'

export interface InboxDeps {
  store: AppStore
  /** Returns null while the user is signed out. */
  getClient: () => GraphQLClient | null
  onChange: (snapshot: InboxSnapshot) => void
  now?: () => string
  fetchPrs?: typeof fetchPullRequests
  fetchLogin?: typeof fetchViewerLogin
}

export class Inbox {
  private snapshot: InboxSnapshot = {
    status: 'signed-out',
    items: [],
    attentionCount: 0,
    lastUpdatedAt: null,
    errorMessage: null,
    myLogin: null,
    seen: {},
  }

  private prs: PullRequest[] = []
  private myLogin: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly now: () => string
  private readonly fetchPrs: typeof fetchPullRequests
  private readonly fetchLogin: typeof fetchViewerLogin

  constructor(private readonly deps: InboxDeps) {
    this.now = deps.now ?? (() => new Date().toISOString())
    this.fetchPrs = deps.fetchPrs ?? fetchPullRequests
    this.fetchLogin = deps.fetchLogin ?? fetchViewerLogin
  }

  getSnapshot(): InboxSnapshot {
    return this.snapshot
  }

  private emit(patch: Partial<InboxSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.deps.onChange(this.snapshot)
  }

  /** Re-runs the classifier over PRs already in memory. No network. */
  reclassify(): void {
    if (this.myLogin === null) return
    const items = classifyAll(this.prs, {
      myLogin: this.myLogin,
      snoozes: this.deps.store.getSnoozes(),
      now: this.now(),
    })
    this.emit({
      items,
      attentionCount: countAttention(items),
      seen: this.deps.store.getSeen(),
    })
  }

  async refresh(): Promise<void> {
    const client = this.deps.getClient()
    if (client === null) {
      this.emit({ status: 'signed-out', items: [], attentionCount: 0 })
      return
    }

    this.emit({ status: 'loading', errorMessage: null })

    try {
      this.myLogin ??= await this.fetchLogin(client)
      this.prs = await this.fetchPrs(
        client,
        this.deps.store.getSettings().repositories,
      )

      const now = this.now()
      const items = classifyAll(this.prs, {
        myLogin: this.myLogin,
        snoozes: this.deps.store.getSnoozes(),
        now,
      })

      this.emit({
        status: 'ready',
        items,
        attentionCount: countAttention(items),
        lastUpdatedAt: now,
        errorMessage: null,
        myLogin: this.myLogin,
        seen: this.deps.store.getSeen(),
      })
    } catch (error) {
      // Keep the last good list on screen; the header shows the staleness.
      this.emit({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  start(): void {
    this.stop()
    const minutes = this.deps.store.getSettings().pollIntervalMinutes
    this.timer = setInterval(() => void this.refresh(), minutes * 60_000)
    void this.refresh()
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
