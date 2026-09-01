import type { DeviceCodePayload } from '@shared/ipc'
import { LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Text, View } from 'reshaped/bundle'

export default function SignIn(): React.JSX.Element {
  const [code, setCode] = useState<DeviceCodePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => window.api.onDeviceCode(setCode), [])

  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.api.startAuth()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setCode(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View padding={6} gap={4} align="center" justify="center" height="100%" minHeight={0}>
      <Text variant="featured-3" weight="bold">
        Pullover
      </Text>

      {code === null ? (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Sign in with GitHub to see what needs you.
          </Text>
          <Button color="primary" icon={LogIn} loading={busy} onClick={() => void start()}>
            Sign in with GitHub
          </Button>
        </>
      ) : (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Enter this code at {code.verificationUri} — it's already on your clipboard.
          </Text>
          <Text variant="featured-2" weight="bold" monospace>
            {code.userCode}
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            Waiting for you to approve…
          </Text>
        </>
      )}

      {error !== null && (
        <Text variant="caption-1" color="critical" align="center">
          {error}
        </Text>
      )}
    </View>
  )
}
