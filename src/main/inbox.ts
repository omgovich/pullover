import { classify, classifyAll, countAttention } from '@core/classify'
import { formatWait } from '@core/format'
import { collectRepositories, filterByRepositories } from '@core/repo-filter'
import { computeStackPositions } from '@core/stack'
import type { InboxSnapshot } from '@shared/ipc'
import type { ClassifiedPullRequest, Provider, PullRequest } from '@shared/types'
import { isAuthError } from './github/auth-error'
import { describeError } from './github/error-message'
import {
  fetchPullRequests,
  fetchViewerLogin,
  type GraphQLClient,
  type SearchStopReason,
} from './github/fetch-prs'
import { formatRestrictedOrgs } from './github/org-restriction'
import { rateLimitResetAt } from './github/rate-limit'
import { type GitLabClient, GitLabHttpError } from './gitlab/client'
import { fetchGitLabMergeRequests, fetchGitLabViewer } from './gitlab/fetch-mrs'
import type { AppStore } from './store'

export interface InboxDeps {
  store: AppStore
  /** Returns null while the user is signed out. */
  getClient: () => GraphQLClient | null
  getGitLabClient?: () => GitLabClient | null
  onChange: (snapshot: InboxSnapshot) => void
  /**
   * Called from the refresh catch block when the failure looks like a dead
   * token (see `isAuthError`) rather than a network blip. `Inbox` never
   * touches token storage itself — it only knows `getClient` — so it hands
   * the decision of what "sign out" means back to the caller.
   */
  onAuthError?: (failed: FailedAccount) => void
  now?: () => string
  fetchPrs?: typeof fetchPullRequests
  fetchLogin?: typeof fetchViewerLogin
}

/** The account a dead-token error came from, so the caller can tell whether it is still active. */
export interface FailedAccount {
  provider: Provider
  client: GraphQLClient | GitLabClient
}

function searchWarning(reasons: SearchStopReason[]): string | null {
  if (reasons.includes('rate-limit')) return 'GitHub quota low; some PRs may be missing'
  if (reasons.includes('page-limit')) return 'GitHub search capped; older PRs may be missing'
  if (reasons.includes('pagination')) return 'GitHub search interrupted; some PRs may be missing'
  return null
}

export class Inbox {
  private snapshot: InboxSnapshot = {
    status: 'signed-out',
    items: [],
    attentionCount: 0,
    lastUpdatedAt: null,
    errorMessage: null,
    myLogin: null,
    accountVersion: 0,
    knownRepositories: [],
  }

  private prs: PullRequest[] = []
  private myLogin: string | null = null
  /** Invalidates results from a refresh started for a previous account. */
  private generation = 0
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
  /** When a hit rate limit lifts. Refreshes are skipped until then. */
  private rateLimitedUntil: string | null = null
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

  /** Clears the previous account immediately, even while its fetch is in flight. */
  reset(connected: boolean): void {
    this.generation += 1
    // Forgotten rather than awaited: a pass for the previous account that
    // never settles would otherwise hold every pass for the new one behind it.
    this.inFlightRefresh = null
    this.queuedRefresh = null
    this.prs = []
    this.myLogin = null
    this.rateLimitedUntil = null
    this.emit({
      status: connected ? 'loading' : 'signed-out',
      items: [],
      attentionCount: 0,
      lastUpdatedAt: null,
      errorMessage: null,
      myLogin: null,
      accountVersion: this.generation,
      knownRepositories: [],
    })
  }

  private emit(patch: Partial<InboxSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.deps.onChange(this.snapshot)
  }

  /**
   * Attaches each item's stack position, computed from `this.prs` — the
   * unfiltered fetch — so a stack stays whole even when the repository
   * filter hides part of it. Shared by `doRefresh` and `reclassify`, the two
   * places that produce items, so the step isn't duplicated between them.
   */
  private attachStacks(items: Omit<ClassifiedPullRequest, 'stack'>[]): ClassifiedPullRequest[] {
    const stacks = computeStackPositions(this.prs)
    return items.map((item) => ({ ...item, stack: stacks.get(item.pr.id) ?? null }))
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
    const items = this.attachStacks(
      classifyAll(filtered, {
        myLogin: this.myLogin,
        snoozes: this.deps.store.getSnoozes(),
        now: this.now(),
      }),
    )
    this.emit({
      items,
      attentionCount: countAttention(items),
    })
  }

  /**
   * Looks in the unfiltered fetch, not in the snapshot: a caller naming a
   * pull request by number should get an answer even when the repository
   * filter or the classifier keeps it out of the window.
   */
  findPullRequest(repository: string, number: number): ClassifiedPullRequest | null {
    if (this.myLogin === null) return null
    const wanted = repository.toLowerCase()
    const pr = this.prs.find((p) => p.number === number && p.repository.toLowerCase() === wanted)
    if (pr === undefined) return null
    const [item] = this.attachStacks([
      classify(pr, {
        myLogin: this.myLogin,
        snoozes: this.deps.store.getSnoozes(),
        now: this.now(),
      }),
    ])
    return item ?? null
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
    if (this.inFlightRefresh === null) return this.runPass()

    if (this.queuedRefresh === null) {
      const queued: Promise<void> = this.inFlightRefresh
        // A failed pass must not strand the callers queued behind it — still
        // run the follow-up pass they asked for.
        .catch(() => undefined)
        .then(() => (this.queuedRefresh === queued ? this.startQueuedPass() : undefined))
      this.queuedRefresh = queued
    }

    return this.queuedRefresh
  }

  /**
   * Resolves when the pass now running has finished, or at once when none
   * is. Never rejects: a failed pass still ends in a snapshot, which is what
   * a caller waiting for one is after.
   */
  whenIdle(): Promise<void> {
    // The queued pass when there is one: it resolves after the pass running
    // now *and* the follow-up behind it, which is what "idle" has to mean.
    const pass = this.queuedRefresh ?? this.inFlightRefresh
    return pass?.catch(() => undefined) ?? Promise.resolve()
  }

  private startQueuedPass(): Promise<void> {
    this.queuedRefresh = null
    return this.runPass()
  }

  private runPass(): Promise<void> {
    const pass: Promise<void> = this.doRefresh().finally(() => {
      if (this.inFlightRefresh === pass) this.inFlightRefresh = null
    })
    this.inFlightRefresh = pass
    return pass
  }

  private async doRefresh(): Promise<void> {
    const generation = this.generation
    const provider = this.deps.store.getSettings().provider
    const gitlab = provider === 'gitlab'
    const client = gitlab ? (this.deps.getGitLabClient?.() ?? null) : this.deps.getClient()
    if (client === null) {
      // Sign-out: drop the cached identity and in-memory PRs so a
      // subsequent sign-in (possibly as a different account) starts clean
      // instead of classifying against the previous user's login.
      this.myLogin = null
      this.prs = []
      this.rateLimitedUntil = null
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

    // Returns before the `loading` emit below, or a manual refresh would
    // strand the interface in a spinner. The snapshot is left alone: its
    // message already says why nothing is happening. Parsed, not compared as
    // strings — the two ISO values need not share precision.
    if (
      this.rateLimitedUntil !== null &&
      Date.parse(this.rateLimitedUntil) > Date.parse(this.now())
    ) {
      return
    }

    this.emit({ status: 'loading', errorMessage: null })

    try {
      const viewer = gitlab ? await fetchGitLabViewer(client as GitLabClient) : null
      if (generation !== this.generation) return
      const myLogin =
        viewer?.username ?? this.myLogin ?? (await this.fetchLogin(client as GraphQLClient))
      if (generation !== this.generation) return
      this.myLogin = myLogin
      // Always fetch unfiltered: the picker's options come from what shows
      // up in the inbox, so the search itself must never be narrowed by the
      // repository selection.
      const { prs, restrictedOrgs, incompleteReasons } =
        viewer !== null
          ? {
              prs: await fetchGitLabMergeRequests(client as GitLabClient, viewer),
              restrictedOrgs: [],
              incompleteReasons: [],
            }
          : await this.fetchPrs(client as GraphQLClient, myLogin)
      if (generation !== this.generation) return
      this.prs = prs

      const settings = this.deps.store.getSettings()
      const filtered = filterByRepositories(
        this.prs,
        settings.watchAllRepositories ? null : settings.repositories,
      )

      const now = this.now()
      const items = this.attachStacks(
        classifyAll(filtered, {
          myLogin: this.myLogin,
          snoozes: this.deps.store.getSnoozes(),
          now,
        }),
      )

      this.rateLimitedUntil = null
      const warnings = [
        searchWarning(incompleteReasons ?? []),
        formatRestrictedOrgs(restrictedOrgs),
      ].filter((warning): warning is string => warning !== null)
      this.emit({
        status: 'ready',
        items,
        attentionCount: countAttention(items),
        lastUpdatedAt: now,
        errorMessage: warnings.length > 0 ? warnings.join(' · ') : null,
        myLogin: this.myLogin,
        knownRepositories: collectRepositories(this.prs),
      })
    } catch (error) {
      if (generation !== this.generation) return
      const resetAt = gitlab
        ? error instanceof GitLabHttpError && error.status === 429
          ? (error.retryAt ?? new Date(Date.parse(this.now()) + 60_000).toISOString())
          : null
        : rateLimitResetAt(error, this.now())
      this.rateLimitedUntil = resetAt
      // Keep the last good list on screen; the header shows the staleness.
      this.emit({
        status: 'error',
        errorMessage:
          resetAt !== null
            ? gitlab
              ? `GitLab rate limit reached — try again in ${formatWait(resetAt, this.now())}`
              : `GitHub's rate limit is reached — try again in ${formatWait(resetAt, this.now())}`
            : gitlab && !(error instanceof GitLabHttpError)
              ? "Couldn't reach GitLab"
              : describeError(error),
      })
      // A dead token fails every refresh the same way forever, so recognise
      // it specifically and hand off to whatever "sign out" means to the
      // caller instead of leaving the user staring at a permanently stale
      // list with a red line in the header.
      if (gitlab ? error instanceof GitLabHttpError && error.status === 401 : isAuthError(error)) {
        this.deps.onAuthError?.({ provider, client })
      }
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
