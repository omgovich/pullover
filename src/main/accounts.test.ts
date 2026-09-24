import { DEFAULT_SETTINGS, type Provider } from '@shared/types'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { Accounts, type AccountsDeps, type DeviceFlow } from './accounts'
import type { DeviceCodeInfo } from './auth/device-flow'
import type { GraphQLClient } from './github/fetch-prs'
import type { GitLabClient } from './gitlab/client'
import { AppStore, type KeyValueStore, type PersistedState } from './store'

class MemoryStore implements KeyValueStore {
  private state: PersistedState = { settings: { ...DEFAULT_SETTINGS }, snoozes: {} }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
  }
}

function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const GITLAB_URL = 'https://gitlab.example.com'
const INFO: DeviceCodeInfo = {
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  deviceCode: 'device',
  interval: 5,
  expiresIn: 900,
}

type GitHubFake = GraphQLClient & { token: string }
type GitLabFake = GitLabClient & { token: string }

let store: AppStore
let tokens: Map<Provider, string>
let inbox: {
  stop: Mock<() => void>
  reset: Mock<(connected: boolean) => void>
  start: Mock<() => void>
}
let verifyGitLab: ReturnType<typeof vi.fn<AccountsDeps['verifyGitLab']>>

beforeEach(() => {
  store = new AppStore(new MemoryStore())
  tokens = new Map()
  inbox = { stop: vi.fn(), reset: vi.fn(), start: vi.fn() }
  verifyGitLab = vi.fn(async () => undefined)
})

function build(deviceFlow: DeviceFlow | null = null): Accounts {
  return new Accounts({
    store,
    inbox,
    tokens: {
      load: (provider) => tokens.get(provider) ?? null,
      save: (token, provider) => tokens.set(provider, token),
      clear: (provider) => tokens.delete(provider),
    },
    createGitHubClient: (token) => Object.assign(async () => ({}), { token }) as GitHubFake,
    createGitLabClient: (_url, token) => ({ token }) as unknown as GitLabFake,
    normalizeGitLabUrl: (url) => url.trim().replace(/\/$/, ''),
    verifyGitLab,
    deviceFlow,
  })
}

function tokenOf(client: GraphQLClient | GitLabClient | null): string | null {
  return client === null ? null : (client as GitHubFake).token
}

describe('Accounts', () => {
  it('keeps the inactive account’s token and repository filter across a switch and a sign-out', async () => {
    const accounts = build()
    await accounts.connectGitLab(`${GITLAB_URL}/`, 'gitlab-token')
    store.updateSettings({ repositories: ['viewst/app'], watchAllRepositories: false })

    tokens.set('github', 'github-token')
    accounts.switchProvider('github')
    expect(store.getSettings()).toMatchObject({ provider: 'github', repositories: [] })
    accounts.signOut()

    expect(tokens.get('github')).toBeUndefined()
    expect(tokens.get('gitlab')).toBe('gitlab-token')

    accounts.switchProvider('gitlab')
    expect(tokenOf(accounts.getGitLabClient())).toBe('gitlab-token')
    expect(accounts.getGitHubClient()).toBeNull()
    expect(store.getSettings()).toMatchObject({
      provider: 'gitlab',
      gitlabUrl: GITLAB_URL,
      repositories: ['viewst/app'],
      watchAllRepositories: false,
    })
    expect(inbox.reset).toHaveBeenLastCalledWith(true)
  })

  it('switches to a provider with no saved token as signed out, without touching the other token', () => {
    tokens.set('gitlab', 'gitlab-token')
    store.switchProvider('gitlab')
    store.updateSettings({ gitlabUrl: GITLAB_URL })
    const accounts = build()
    accounts.loadFromDisk()

    accounts.switchProvider('github')

    expect(accounts.isConnected()).toBe(false)
    expect(inbox.reset).toHaveBeenLastCalledWith(false)
    expect(inbox.start).not.toHaveBeenCalled()
    expect(tokens.get('gitlab')).toBe('gitlab-token')
  })

  it('cancels a device-code request that a switch overtakes, saving nothing', async () => {
    tokens.set('gitlab', 'gitlab-token')
    store.switchProvider('gitlab')
    store.updateSettings({ gitlabUrl: GITLAB_URL })
    const code = deferred<DeviceCodeInfo>()
    const flow: DeviceFlow = {
      requestCode: () => code.promise,
      present: vi.fn(),
      pollForToken: vi.fn(async () => 'github-token'),
    }
    const signingIn = build(flow)
    signingIn.loadFromDisk()

    const connecting = signingIn.signIn(() => {})
    signingIn.switchProvider('gitlab')
    code.resolve(INFO)

    await expect(connecting).rejects.toThrow('GitHub sign-in was cancelled')
    expect(tokens.has('github')).toBe(false)
    expect(store.getSettings().provider).toBe('gitlab')
    expect(tokenOf(signingIn.getGitLabClient())).toBe('gitlab-token')
    expect(flow.present).not.toHaveBeenCalled()
  })

  it('cancels a pending GitHub sign-in when the user goes back', async () => {
    const code = deferred<DeviceCodeInfo>()
    const flow: DeviceFlow = {
      requestCode: vi.fn((signal) => {
        signal.addEventListener('abort', () => code.reject(signal.reason))
        return code.promise
      }),
      present: vi.fn(),
      pollForToken: vi.fn(async () => 'github-token'),
    }
    const accounts = build(flow)

    const pending = accounts.signIn(() => {})
    accounts.cancelSignIn()

    await expect(pending).rejects.toThrow('GitHub sign-in was cancelled')
    expect(tokens.has('github')).toBe(false)
    expect(flow.present).not.toHaveBeenCalled()
  })

  it('stops a device-code sign-in a switch cancels, and lets the next one show a fresh code', async () => {
    const polls: AbortSignal[] = []
    const approved = deferred<string>()
    const flow: DeviceFlow = {
      requestCode: vi.fn(async () => INFO),
      present: vi.fn(),
      pollForToken: vi.fn((_info, signal: AbortSignal) => {
        polls.push(signal)
        if (polls.length === 2) return approved.promise
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
        })
      }),
    }
    const accounts = build(flow)

    const firstCodes = vi.fn()
    const first = accounts.signIn(firstCodes)
    await vi.waitFor(() => expect(polls).toHaveLength(1))
    accounts.switchProvider('gitlab')
    expect(polls[0]!.aborted).toBe(true)
    await expect(first).rejects.toThrow('GitHub sign-in was cancelled')

    accounts.switchProvider('github')
    const secondCodes = vi.fn()
    const second = accounts.signIn(secondCodes)
    await vi.waitFor(() => expect(polls).toHaveLength(2))
    approved.resolve('github-token')
    await second

    expect(secondCodes).toHaveBeenCalledWith({
      userCode: INFO.userCode,
      verificationUri: INFO.verificationUri,
    })
    expect(tokenOf(accounts.getGitHubClient())).toBe('github-token')
  })

  it('lets a second sign-in join one still in progress instead of starting a rival', async () => {
    const approved = deferred<string>()
    const flow: DeviceFlow = {
      requestCode: vi.fn(async () => INFO),
      present: vi.fn(),
      pollForToken: vi.fn(() => approved.promise),
    }
    const accounts = build(flow)

    const first = accounts.signIn(() => {})
    const second = accounts.signIn(() => {})
    approved.resolve('github-token')
    await Promise.all([first, second])

    expect(flow.requestCode).toHaveBeenCalledTimes(1)
  })

  it('ignores a dead-token report about a client that has since been replaced', async () => {
    tokens.set('github', 'old-token')
    const accounts = build({
      requestCode: async () => INFO,
      present: vi.fn(),
      pollForToken: async () => 'new-token',
    })
    accounts.loadFromDisk()
    const oldClient = accounts.getGitHubClient()!
    await accounts.signIn(() => {})

    accounts.handleAuthError({ provider: 'github', client: oldClient })

    expect(tokens.get('github')).toBe('new-token')
    expect(tokenOf(accounts.getGitHubClient())).toBe('new-token')
  })

  it('signs the dead account out without cancelling a connection to the other provider', async () => {
    const approved = deferred<string>()
    const flow: DeviceFlow = {
      requestCode: async () => INFO,
      present: vi.fn(),
      pollForToken: vi.fn(() => approved.promise),
    }
    const accounts = build(flow)
    await accounts.connectGitLab(GITLAB_URL, 'gitlab-token')

    const connecting = accounts.signIn(() => {})
    await vi.waitFor(() => expect(flow.pollForToken).toHaveBeenCalled())
    accounts.handleAuthError({ provider: 'gitlab', client: accounts.getGitLabClient()! })
    expect(tokens.has('gitlab')).toBe(false)
    expect(inbox.reset).toHaveBeenLastCalledWith(false)

    approved.resolve('github-token')
    await connecting
    expect(store.getSettings().provider).toBe('github')
    expect(tokenOf(accounts.getGitHubClient())).toBe('github-token')
  })

  it('leaves the saved token alone when a new one fails its check', async () => {
    const accounts = build()
    await accounts.connectGitLab(GITLAB_URL, 'good-token')
    verifyGitLab.mockRejectedValueOnce(new Error('GitLab token is invalid or expired'))

    await expect(accounts.connectGitLab(GITLAB_URL, 'bad-token')).rejects.toThrow(/invalid/)

    expect(tokens.get('gitlab')).toBe('good-token')
    expect(tokenOf(accounts.getGitLabClient())).toBe('good-token')
  })
})
