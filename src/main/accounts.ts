import type { Provider } from '@shared/types'
import type { DeviceCodeInfo } from './auth/device-flow'
import type { GraphQLClient } from './github/fetch-prs'
import type { GitLabClient } from './gitlab/client'
import type { FailedAccount, Inbox } from './inbox'
import type { AppStore } from './store'

export interface TokenStorage {
  load: (provider: Provider) => string | null
  save: (token: string, provider: Provider) => void
  clear: (provider: Provider) => void
}

export interface DeviceFlow {
  requestCode: (signal: AbortSignal) => Promise<DeviceCodeInfo>
  pollForToken: (info: DeviceCodeInfo, signal: AbortSignal) => Promise<string>
  /** Hands the code to the user — clipboard, browser — once it is known. */
  present: (info: DeviceCodeInfo) => void | Promise<void>
}

export interface AccountsDeps {
  store: AppStore
  inbox: Pick<Inbox, 'stop' | 'reset' | 'start'>
  tokens: TokenStorage
  createGitHubClient: (token: string) => GraphQLClient
  createGitLabClient: (serverUrl: string, token: string) => GitLabClient
  normalizeGitLabUrl: (serverUrl: string) => string
  /** Resolves once the GitLab token has been shown to work, and rejects otherwise. */
  verifyGitLab: (client: GitLabClient) => Promise<unknown>
  /** Absent when the build has no OAuth client id. */
  deviceFlow: DeviceFlow | null
}

type ActiveAccount =
  | { provider: 'github'; client: GraphQLClient }
  | { provider: 'gitlab'; client: GitLabClient }

export type DeviceCodeListener = (payload: { userCode: string; verificationUri: string }) => void

const PROVIDER_NAMES: Record<Provider, string> = { github: 'GitHub', gitlab: 'GitLab' }

/**
 * The signed-in account the inbox reads from, and every way of changing it.
 * Both providers keep their own token on disk; only one is ever active, and
 * `store.getSettings().provider` always names it.
 */
export class Accounts {
  private active: ActiveAccount | null = null
  /** The sign-in or token check in progress, cancelled by whatever starts after it. */
  private attempt: AbortController | null = null
  private deviceSignIn: { promise: Promise<void>; signal: AbortSignal } | null = null

  constructor(private readonly deps: AccountsDeps) {}

  getGitHubClient(): GraphQLClient | null {
    return this.active?.provider === 'github' ? this.active.client : null
  }

  getGitLabClient(): GitLabClient | null {
    return this.active?.provider === 'gitlab' ? this.active.client : null
  }

  isConnected(): boolean {
    return this.active !== null
  }

  loadFromDisk(): void {
    const { provider, gitlabUrl } = this.deps.store.getSettings()
    const token = this.deps.tokens.load(provider)
    if (token === null) this.active = null
    else if (provider === 'github') {
      this.active = { provider, client: this.deps.createGitHubClient(token) }
    } else {
      this.active = gitlabUrl
        ? { provider, client: this.deps.createGitLabClient(gitlabUrl, token) }
        : null
    }
  }

  switchProvider(provider: Provider): void {
    if (provider !== 'github' && provider !== 'gitlab') throw new Error('Unknown provider')
    this.cancelAttempt()
    if (this.deps.store.getSettings().provider === provider && this.active !== null) return
    this.deps.store.switchProvider(provider)
    this.loadFromDisk()
    this.restartInbox()
  }

  async connectGitLab(serverUrl: string, token: string): Promise<void> {
    const signal = this.beginAttempt()
    const normalized = this.deps.normalizeGitLabUrl(serverUrl)
    const client = this.deps.createGitLabClient(normalized, token)
    await this.deps.verifyGitLab(client)
    this.throwIfCancelled(signal, 'gitlab')
    this.deps.tokens.save(token, 'gitlab')
    this.deps.store.updateSettings({ gitlabUrl: normalized })
    this.activate({ provider: 'gitlab', client })
  }

  /**
   * A device-code sign-in stays in flight for up to the code's expiry (15
   * minutes by default). A second call joins that run rather than starting a
   * rival cycle that would fight it for the clipboard and the token; its
   * `onDeviceCode` is never invoked. A run that was cancelled is not joined —
   * it is already on its way out.
   */
  signIn(onDeviceCode: DeviceCodeListener): Promise<void> {
    if (this.deviceSignIn !== null && !this.deviceSignIn.signal.aborted) {
      return this.deviceSignIn.promise
    }
    const signal = this.beginAttempt()
    const run = this.runDeviceFlow(signal, onDeviceCode)
    const entry = {
      signal,
      promise: run.finally(() => {
        if (this.deviceSignIn === entry) this.deviceSignIn = null
      }),
    }
    this.deviceSignIn = entry
    return entry.promise
  }

  signOut(): void {
    this.cancelAttempt()
    this.deps.tokens.clear(this.deps.store.getSettings().provider)
    this.active = null
    this.restartInbox()
  }

  cancelSignIn(): void {
    this.cancelAttempt()
  }

  /**
   * A refresh found this account's token dead. Ignored unless that account is
   * still the active one, and leaves any sign-in in progress alone — a dead
   * GitLab token is no reason to abandon a GitHub connection being made.
   */
  handleAuthError(failed: FailedAccount): void {
    if (this.active === null || this.active.client !== failed.client) return
    this.deps.tokens.clear(failed.provider)
    this.active = null
    this.restartInbox()
  }

  /** Starting the timer while signed out would only re-emit signed-out every tick. */
  restartPolling(): void {
    if (this.active === null) this.deps.inbox.stop()
    else this.deps.inbox.start()
  }

  private async runDeviceFlow(
    signal: AbortSignal,
    onDeviceCode: DeviceCodeListener,
  ): Promise<void> {
    const flow = this.deps.deviceFlow
    if (flow === null) throw new Error('MAIN_VITE_GITHUB_CLIENT_ID is not set — fill in your .env')
    const info = await flow.requestCode(signal).catch((error: unknown) => {
      this.throwIfCancelled(signal, 'github')
      throw error
    })
    this.throwIfCancelled(signal, 'github')
    onDeviceCode({ userCode: info.userCode, verificationUri: info.verificationUri })
    await flow.present(info)
    const token = await flow.pollForToken(info, signal).catch((error: unknown) => {
      this.throwIfCancelled(signal, 'github')
      throw error
    })
    this.throwIfCancelled(signal, 'github')
    this.deps.tokens.save(token, 'github')
    this.activate({ provider: 'github', client: this.deps.createGitHubClient(token) })
  }

  private activate(account: ActiveAccount): void {
    this.deps.store.switchProvider(account.provider)
    this.active = account
    this.restartInbox()
  }

  private restartInbox(): void {
    this.deps.inbox.stop()
    this.deps.inbox.reset(this.active !== null)
    if (this.active !== null) this.deps.inbox.start()
  }

  private beginAttempt(): AbortSignal {
    this.cancelAttempt()
    this.attempt = new AbortController()
    return this.attempt.signal
  }

  private cancelAttempt(): void {
    this.attempt?.abort(new Error('Sign-in was cancelled'))
    this.attempt = null
  }

  private throwIfCancelled(signal: AbortSignal, provider: Provider): void {
    if (signal.aborted) throw new Error(`${PROVIDER_NAMES[provider]} sign-in was cancelled`)
  }
}
