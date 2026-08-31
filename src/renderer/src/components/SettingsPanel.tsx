import { useEffect, useState } from 'react'
import { Button, Card, Text, TextField, View } from 'reshaped/bundle'
import type { Settings } from '@shared/types'

interface Props {
  onClose: () => void
}

const INTERVAL_OPTIONS = [1, 5, 15, 30]

export default function SettingsPanel({ onClose }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setSettings(await window.api.getSettings())
  }

  useEffect(() => {
    void reload()
  }, [])

  const addRepository = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.addRepository(draft)
      setDraft('')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const removeRepository = async (fullName: string): Promise<void> => {
    await window.api.removeRepository(fullName)
    await reload()
  }

  const setInterval = async (minutes: number): Promise<void> => {
    await window.api.setSettings({ pollIntervalMinutes: minutes })
    await reload()
  }

  if (settings === null) return <View padding={4} />

  return (
    <View height="100vh" backgroundColor="page">
      <View
        direction="row"
        align="center"
        padding={3}
        borderColor="neutral-faded"
        borderBottom
      >
        <Text variant="body-2" weight="bold">
          Settings
        </Text>
        <View grow />
        <Button size="small" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </View>

      <View overflow="auto" grow padding={3} gap={5}>
        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            REPOS
          </Text>

          <View direction="row" gap={2}>
            <View grow>
              <TextField
                name="repository"
                value={draft}
                placeholder="owner/repo"
                size="small"
                onChange={({ value }) => setDraft(value)}
                inputAttributes={{
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') void addRepository()
                  },
                }}
              />
            </View>
            <Button
              size="small"
              color="primary"
              disabled={draft.trim() === ''}
              onClick={() => void addRepository()}
            >
              Add
            </Button>
          </View>

          {error !== null && (
            <Text variant="caption-1" color="critical">
              {error}
            </Text>
          )}

          {settings.repositories.length === 0 ? (
            <Text variant="caption-1" color="neutral-faded">
              None yet — that's why the list is empty.
            </Text>
          ) : (
            settings.repositories.map((repo) => (
              <Card key={repo} padding={2}>
                <View direction="row" align="center" gap={2}>
                  <Text variant="caption-1">{repo}</Text>
                  <View grow />
                  <Button
                    size="small"
                    variant="ghost"
                    color="critical"
                    onClick={() => void removeRepository(repo)}
                  >
                    Remove
                  </Button>
                </View>
              </Card>
            ))
          )}
        </View>

        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            REFRESH EVERY
          </Text>
          <View direction="row" gap={2}>
            {INTERVAL_OPTIONS.map((minutes) => (
              <Button
                key={minutes}
                size="small"
                variant={
                  settings.pollIntervalMinutes === minutes ? 'solid' : 'outline'
                }
                onClick={() => void setInterval(minutes)}
              >
                {minutes} min
              </Button>
            ))}
          </View>
        </View>

        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            ACCOUNT
          </Text>
          <View direction="row">
            <Button
              size="small"
              variant="outline"
              color="critical"
              onClick={() => void window.api.signOut()}
            >
              Sign out
            </Button>
          </View>
        </View>
      </View>
    </View>
  )
}
