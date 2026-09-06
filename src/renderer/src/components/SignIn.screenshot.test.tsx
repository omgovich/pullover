import type { DeviceCodePayload } from '@shared/ipc'
import { visualCase } from '../test/visual'
import SignIn from './SignIn'

/**
 * The only component screenshotted here that reaches for the IPC bridge on
 * mount, so the bridge is stubbed rather than the component reshaped to suit
 * the test. `SignIn` fills its parent, which in the app is the shell's whole
 * column, so the case gives it a height to fill.
 */
function signIn(code: DeviceCodePayload | null): React.JSX.Element {
  window.api = {
    onDeviceCode: (listener: (payload: DeviceCodePayload) => void) => {
      if (code !== null) listener(code)
      return () => {}
    },
  } as unknown as typeof window.api

  return (
    <div style={{ height: 320 }}>
      <SignIn />
    </div>
  )
}

visualCase('prompt', () => signIn(null))

visualCase('device-code', () =>
  signIn({ userCode: 'WDJB-MJHT', verificationUri: 'github.com/login/device' }),
)
