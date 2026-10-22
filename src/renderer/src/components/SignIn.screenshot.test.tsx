import type { DeviceCodePayload } from '@shared/ipc'
import { DEFAULT_SETTINGS } from '@shared/types'
import { Reshaped } from 'reshaped/bundle'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { visualCase } from '../test/visual'
import SignIn from './SignIn'

/**
 * The only component screenshotted here that reaches for the IPC bridge on
 * mount, so the bridge is stubbed rather than the component reshaped to suit
 * the test. `SignIn` fills its parent, which in the app is the shell's whole
 * column, so the case gives it a height to fill.
 */
function signIn(
  code: DeviceCodePayload | null,
  provider: 'github' | 'gitlab' = 'github',
  height = provider === 'gitlab' ? 620 : 320,
  oauthAvailable = true,
): React.JSX.Element {
  window.api = {
    getSettings: () => Promise.resolve({ ...DEFAULT_SETTINGS, provider }),
    onSettings: () => () => {},
    switchProvider: async () => {},
    cancelAuth: async () => {},
    canUseGitHubDeviceFlow: async () => oauthAvailable,
    startAuth: async () => {},
    onDeviceCode: (listener: (payload: DeviceCodePayload) => void) => {
      if (code !== null) listener(code)
      return () => {}
    },
  } as unknown as typeof window.api

  return (
    <div style={{ height }}>
      <SignIn />
    </div>
  )
}

visualCase('prompt', () => signIn(null))
visualCase('gitlab', () => signIn(null, 'gitlab'))

test('GitHub browser sign-in (light)', async () => {
  document.documentElement.setAttribute('data-rs-color-mode', 'light')
  const screen = await render(
    <Reshaped theme="slate" defaultColorMode="light">
      <div data-testid="github-sign-in" style={{ width: '440px', height: 620 }}>
        {signIn(null, 'github', 620)}
      </div>
    </Reshaped>,
  )

  await screen.getByRole('button', { name: 'GitHub', exact: true }).click()
  const signInButton = screen.getByRole('button', { name: 'Sign in with GitHub' })
  await expect.element(signInButton).toBeEnabled()
  await expect.element(screen.getByLabelText('GitLab access token')).not.toBeInTheDocument()
  await expect.element(screen.getByTestId('github-sign-in')).toMatchScreenshot('github-oauth-light')

  const startAuth = vi.fn(async () => {})
  window.api.startAuth = startAuth
  await signInButton.click()
  expect(startAuth).toHaveBeenCalledOnce()
})

test('explains why a source build without OAuth configuration cannot sign in', async () => {
  const screen = await render(signIn(null, 'github', 320, false))
  await screen.getByRole('button', { name: 'GitHub', exact: true }).click()
  await expect.element(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeDisabled()
  await expect.element(screen.getByText(/needs a GitHub OAuth Client ID/)).toBeVisible()
})

for (const mode of ['light', 'dark'] as const) {
  test(`device-code (${mode})`, async () => {
    document.documentElement.setAttribute('data-rs-color-mode', mode)
    const codeEvents: { send?: (payload: DeviceCodePayload) => void } = {}
    window.api = {
      getSettings: async () => ({ ...DEFAULT_SETTINGS, provider: 'github' }),
      onSettings: () => () => {},
      switchProvider: async () => {},
      cancelAuth: async () => {},
      canUseGitHubDeviceFlow: async () => true,
      onDeviceCode: (listener: (payload: DeviceCodePayload) => void) => {
        codeEvents.send = listener
        return () => {}
      },
      startAuth: () => new Promise<void>(() => {}),
    } as unknown as typeof window.api
    const screen = await render(
      <Reshaped theme="slate" defaultColorMode={mode}>
        <div data-testid="visual-root" style={{ width: '440px', height: 320 }}>
          <SignIn />
        </div>
      </Reshaped>,
    )

    await screen.getByRole('button', { name: 'GitHub', exact: true }).click()
    await screen.getByRole('button', { name: 'Sign in with GitHub' }).click()
    codeEvents.send?.({ userCode: 'WDJB-MJHT', verificationUri: 'github.com/login/device' })
    await expect.element(screen.getByText('WDJB-MJHT')).toBeVisible()
    await expect.element(screen.getByTestId('visual-root')).toMatchScreenshot(`device-code-${mode}`)
  })
}

test('keeps a GitLab URL typed before saved settings arrive', async () => {
  let resolveSettings!: (settings: typeof DEFAULT_SETTINGS) => void
  const settings = new Promise<typeof DEFAULT_SETTINGS>((resolve) => {
    resolveSettings = resolve
  })
  window.api = {
    getSettings: () => settings,
    onSettings: () => () => {},
    switchProvider: async () => {},
    cancelAuth: async () => {},
    canUseGitHubDeviceFlow: async () => true,
    onDeviceCode: () => () => {},
  } as unknown as typeof window.api
  const screen = await render(<SignIn />)
  await screen.getByRole('button', { name: 'GitLab' }).click()
  const input = screen.getByLabelText('GitLab server URL')
  await input.fill('https://new.gitlab.example.com')
  resolveSettings({
    ...DEFAULT_SETTINGS,
    provider: 'gitlab',
    gitlabUrl: 'https://old.gitlab.example.com',
  })
  await expect.element(input).toHaveValue('https://new.gitlab.example.com')
})

test('Back cancels GitHub sign-in and ignores a late device code', async () => {
  const codeEvents: { send?: (payload: DeviceCodePayload) => void } = {}
  let rejectAuth!: (reason: Error) => void
  const cancelAuth = vi.fn(async () => {})
  window.api = {
    getSettings: async () => DEFAULT_SETTINGS,
    onSettings: () => () => {},
    switchProvider: async () => {},
    cancelAuth,
    canUseGitHubDeviceFlow: async () => true,
    onDeviceCode: (listener: (payload: DeviceCodePayload) => void) => {
      codeEvents.send = listener
      return () => {}
    },
    startAuth: () =>
      new Promise<void>((_resolve, reject) => {
        rejectAuth = reject
      }),
  } as unknown as typeof window.api
  const screen = await render(<SignIn />)
  await screen.getByRole('button', { name: 'GitHub', exact: true }).click()
  await screen.getByRole('button', { name: 'Sign in with GitHub' }).click()
  await screen.getByRole('button', { name: 'Back' }).click()
  expect(cancelAuth).toHaveBeenCalledOnce()
  await screen.getByRole('button', { name: 'GitLab' }).click()
  codeEvents.send?.({ userCode: 'LATE-CODE', verificationUri: 'github.com/login/device' })
  rejectAuth(new Error('GitHub sign-in was cancelled'))
  await expect.element(screen.getByLabelText('GitLab access token')).toBeVisible()
  await expect.element(screen.getByText('LATE-CODE')).not.toBeInTheDocument()
  await expect.element(screen.getByText('GitHub sign-in was cancelled')).not.toBeInTheDocument()
})
