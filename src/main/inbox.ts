import { classifyAll, countAttention } from '@core/classify'
import { collectRepositories, filterByRepositories } from '@core/repo-filter'
import type { InboxSnapshot } from '@shared/ipc'
import type { PullRequest } from '@shared/types'
import { fetchPullRequests, fetchViewerLogin, type GraphQLClient } from './github/fetch-prs'
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
    knownRepositories: [],
  }

  private prs: PullRequest[] = []
  private myLogin: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  /** The pass currently running, if any. */
  private inFlightRefresh: Promise<void> | null = null
  /**
   * At most one extra pass queued to run once the in-flight one finishes.
   * Every caller that arrives while a pass is running shares this single
   * follow-up promise, so N overlapping callers produce one extra pass, not
   * N of them.
   */
  private queuedRefresh: Promise<void> | null = null
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

  /**
   * Re-runs the classifier over PRs already in memory. No network. This is
   * also how a changed repository selection takes effect: `this.prs` always
   * holds the unfiltered fetch, and narrowing happens here, so ticking a
   * checkbox updates the inbox instantly instead of waiting on a refetch.
   */
  reclassify(): void {
    if (this.myLogin === null) return
    const settings = this.deps.store.getSettings()
    const filtered = filterByRepositories(
      this.prs,
      settings.watchAllRepositories ? null : settings.repositories,
    )
    const items = classifyAll(filtered, {
      myLogin: this.myLogin,
      snoozes: this.deps.store.getSnoozes(),
      now: this.now(),
    })
    this.emit({
      items,
      attentionCount: countAttention(items),
    })
  }

  /**
   * Runs exactly one pass at a time. A caller that arrives while a pass is
   * already running does NOT join it — that pass may have already read
   * state (settings, the signed-in client) that predates this caller's
   * change, which is exactly how a caller that mutates state and then
   * awaits refresh() (signOut, addRepository, removeRepository) used to see
   * its change silently dropped. Instead, such a caller is queued behind a
   * single follow-up pass that starts only after the current one finishes,
   * so its returned promise always resolves after a pass that began after
   * the call was made. Multiple callers arriving during the same pass share
   * one follow-up (see queuedRefresh).
   */
  async refresh(): Promise<void> {
    if (this.inFlightRefresh === null) {
      this.inFlightRefresh = this.runPass()
      return this.inFlightRefresh
    }

    this.queuedRefresh ??= this.inFlightRefresh
      // A failed pass must not strand the callers queued behind it — still
      // run the follow-up pass they asked for.
      .catch(() => undefined)
      .then(() => this.startQueuedPass())

    return this.queuedRefresh
  }

  private startQueuedPass(): Promise<void> {
    this.queuedRefresh = null
    this.inFlightRefresh = this.runPass()
    return this.inFlightRefresh
  }

  private async runPass(): Promise<void> {
    try {
      await this.doRefresh()
    } finally {
      this.inFlightRefresh = null
    }
  }

  private async doRefresh(): Promise<void> {
    const client = this.deps.getClient()
    if (client === null) {
      // Sign-out: drop the cached identity and in-memory PRs so a
      // subsequent sign-in (possibly as a different account) starts clean
      // instead of classifying against the previous user's login.
      this.myLogin = null
      this.prs = []
      this.emit({
        status: 'signed-out',
        items: [],
        attentionCount: 0,
        lastUpdatedAt: null,
        errorMessage: null,
        myLogin: null,
        knownRepositories: [],
      })
      return
    }

    this.emit({ status: 'loading', errorMessage: null })

    try {
      this.myLogin ??= await this.fetchLogin(client)
      const myLogin = this.myLogin
      // Always fetch unfiltered: the picker's options come from what shows
      // up in the inbox, so the search itself must never be narrowed by the
      // repository selection.
      this.prs = await this.fetchPrs(client, myLogin)

      const settings = this.deps.store.getSettings()
      const filtered = filterByRepositories(
        this.prs,
        settings.watchAllRepositories ? null : settings.repositories,
      )

      const now = this.now()
      const items = classifyAll(filtered, {
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
        knownRepositories: collectRepositories(this.prs),
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
