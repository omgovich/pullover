import { describe, expect, it, vi } from 'vitest'
import { pollForToken, requestDeviceCode } from './device-flow'
import type { DeviceCodeInfo } from './device-flow'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const INFO: DeviceCodeInfo = {
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  deviceCode: 'device-code-value',
  interval: 5,
  expiresIn: 900,
}

describe('requestDeviceCode', () => {
  it('posts the client id and returns the user code', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        device_code: 'device-code-value',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        interval: 5,
        expires_in: 900,
      }),
    )

    const info = await requestDeviceCode('client-123', fetchFn as unknown as typeof fetch)

    expect(info).toEqual(INFO)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://github.com/login/device/code')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      client_id: 'client-123',
      scope: 'repo read:org',
    })
  })

  it('throws when GitHub reports an error', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: 'unauthorized_client' }),
    )
    await expect(
      requestDeviceCode('bad', fetchFn as unknown as typeof fetch),
    ).rejects.toThrow(/unauthorized_client/)
  })
})

describe('pollForToken', () => {
  it('returns the token once the user approves', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'gho_secret' }))
    const sleep = vi.fn(async () => {})

    const token = await pollForToken('client-123', INFO, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep,
    })

    expect(token).toBe('gho_secret')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(5000)
  })

  it('backs off by five seconds on slow_down', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'gho_secret' }))
    const sleep = vi.fn(async () => {})

    await pollForToken('client-123', INFO, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep,
    })

    expect(sleep).toHaveBeenNthCalledWith(1, 5000)
    expect(sleep).toHaveBeenNthCalledWith(2, 10000)
  })

  it('gives up when the user denies the request', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'access_denied' }))
    await expect(
      pollForToken('client-123', INFO, {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/access_denied/)
  })

  it('gives up when the device code expires', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'expired_token' }))
    await expect(
      pollForToken('client-123', INFO, {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/expired_token/)
  })
})
