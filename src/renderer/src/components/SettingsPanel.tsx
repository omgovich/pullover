import { useEffect, useState } from 'react'
import { Button, Checkbox, Text, View } from 'reshaped/bundle'
import type { Settings } from '@shared/types'

interface Props {
  knownRepositories: string[]
  onClose: () => void
}

const INTERVAL_OPTIONS = [1, 5, 15, 30]

/**
 * Options to render = the union of `knownRepositories` and
 * `settings.repositories`, sorted, unique, and deduped case-insensitively.
 * Stored repository names are lowercased, while GitHub returns them in
 * their original case — prefer the original casing when a name shows up in
 * both, since it reads better.
 */
function repositoryOptions(known: string[], selected: string[]): string[] {
  const byLower = new Map<string, string>()
  for (const repo of [...known, ...selected]) {
    if (!byLower.has(repo.toLowerCase())) byLower.set(repo.toLowerCase(), repo)
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b))
}

export default function SettingsPanel({
  knownRepositories,
  onClose,
}: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setSettings(await window.api.getSettings())
  }

  useEffect(() => {
    void reload()
  }, [])

  const toggleRepository = async (fullName: string, checked: boolean): Promise<void> => {
    setError(null)
    try {
      if (checked) {
        await window.api.addRepository(fullName)
      } else {
        await window.api.removeRepository(fullName)
      }
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const setInterval = async (minutes: number): Promise<void> => {
    await window.api.setSettings({ pollIntervalMinutes: minutes })
    await reload()
  }

  const setWatchAll = async (checked: boolean): Promise<void> => {
    await window.api.setSettings({ watchAllRepositories: checked })
    await reload()
  }

  if (settings === null) return <View padding={4} />

  const options = repositoryOptions(knownRepositories, settings.repositories)

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

          <Checkbox
            name="watch-all"
            checked={settings.watchAllRepositories}
            onChange={({ checked }) => void setWatchAll(checked)}
          >
            Watch every repo I'm involved in
          </Checkbox>

          {error !== null && (
            <Text variant="caption-1" color="critical">
              {error}
            </Text>
          )}

          {!settings.watchAllRepositories && (
            <>
              {options.length === 0 ? (
                <Text variant="caption-1" color="neutral-faded">
                  Nothing in your inbox yet, so there's nothing to narrow.
                </Text>
              ) : (
                <>
                  {settings.repositories.length === 0 && (
                    <Text variant="caption-1" color="neutral-faded">
                      Nothing ticked, so nothing shows. Tick the repos you care about.
                    </Text>
                  )}
                  {options.map((repo) => (
                    <Checkbox
                      key={repo}
                      name={`repository-${repo}`}
                      checked={settings.repositories.includes(repo.toLowerCase())}
                      onChange={({ checked }) => void toggleRepository(repo, checked)}
                    >
                      {repo}
                    </Checkbox>
                  ))}
                </>
              )}
            </>
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
