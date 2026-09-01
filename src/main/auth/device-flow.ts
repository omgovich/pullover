export const GITHUB_SCOPES = 'repo read:org'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  deviceCode: string
  /** Seconds GitHub asks us to wait between polls. */
  interval: number
  expiresIn: number
}

export interface PollDeps {
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

interface DeviceCodeResponse {
  device_code?: string
  user_code?: string
  verification_uri?: string
  interval?: number
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

async function postJson<T>(
  url: string,
  body: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<T> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} from ${url}`)
  }
  return (await response.json()) as T
}

function describeError(error: string, description?: string): string {
  return description ? `${error}: ${description}` : error
}

export async function requestDeviceCode(
  clientId: string,
  fetchFn: typeof fetch = fetch,
): Promise<DeviceCodeInfo> {
  const data = await postJson<DeviceCodeResponse>(
    DEVICE_CODE_URL,
    { client_id: clientId, scope: GITHUB_SCOPES },
    fetchFn,
  )

  if (data.error !== undefined) {
    throw new Error(describeError(data.error, data.error_description))
  }
  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error('GitHub sent back an incomplete device code response')
  }

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in ?? 900,
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Polls until the user approves the device in their browser. Resolves with the
 * access token, or rejects if the user denies it or the code expires.
 */
export async function pollForToken(
  clientId: string,
  info: DeviceCodeInfo,
  deps: PollDeps = {},
): Promise<string> {
  const fetchFn = deps.fetchFn ?? fetch
  const sleep = deps.sleep ?? defaultSleep
  let intervalMs = info.interval * 1000
  let elapsedMs = 0
  const expiresInMs = info.expiresIn * 1000

  for (;;) {
    await sleep(intervalMs)
    elapsedMs += intervalMs

    if (elapsedMs >= expiresInMs) {
      throw new Error('That code expired. Sign in again.')
    }

    const data = await postJson<TokenResponse>(
      ACCESS_TOKEN_URL,
      {
        client_id: clientId,
        device_code: info.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
      fetchFn,
    )

    if (data.access_token !== undefined) return data.access_token

    switch (data.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        intervalMs += 5000
        break
      default:
        throw new Error(describeError(data.error ?? 'unknown_error', data.error_description))
    }
  }
}
