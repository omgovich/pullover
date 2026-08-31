import { useEffect, useState } from 'react'
import { Button, Text, View } from 'reshaped/bundle'
import type { DeviceCodePayload } from '@shared/ipc'

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
    <View padding={6} gap={4} align="center" justify="center" height="100%">
      <Text variant="featured-3" weight="bold">
        GitHub Review Inbox
      </Text>

      {code === null ? (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Войди через GitHub, чтобы увидеть свои PRы.
          </Text>
          <Button color="primary" loading={busy} onClick={() => void start()}>
            Войти через GitHub
          </Button>
        </>
      ) : (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Введи этот код на {code.verificationUri} — он уже скопирован в буфер.
          </Text>
          <Text variant="featured-2" weight="bold" monospace>
            {code.userCode}
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            Ждём подтверждения…
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
