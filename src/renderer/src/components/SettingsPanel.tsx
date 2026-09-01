import type { ThemePreference } from '@shared/types'
import { User } from 'lucide-react'
import { Avatar, Button, Divider, Link, Tabs, Text, View } from 'reshaped/bundle'
import { useSettings } from '../useSettings'
import RepositoryPicker from './RepositoryPicker'

interface Props {
  knownRepositories: string[]
  myLogin: string | null
  onClose: () => void
}

const INTERVAL_OPTIONS = [1, 5, 15, 30]

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export default function SettingsPanel({
  knownRepositories,
  myLogin,
  onClose,
}: Props): React.JSX.Element {
  const settings = useSettings()

  const setInterval = async (minutes: number): Promise<void> => {
    await window.api.setSettings({ pollIntervalMinutes: minutes })
  }

  const setTheme = async (theme: ThemePreference): Promise<void> => {
    await window.api.setSettings({ theme })
  }

  if (settings === null) return <View padding={4} height="100%" minHeight={0} />

  return (
    <View height="100%" minHeight={0}>
      <View direction="row" align="center" padding={3} borderColor="neutral-faded" borderBottom>
        <Text variant="body-2" weight="bold">
          Settings
        </Text>
        <View grow />
        <Button size="small" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </View>

      <View overflow="hidden" grow minHeight="0px" paddingTop={3} paddingInline={3} gap={4}>
        <RepositoryPicker
          knownRepositories={knownRepositories}
          selected={settings.repositories}
          watchAll={settings.watchAllRepositories}
        />

        <Divider />

        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            REFRESH EVERY
          </Text>
          {/* Tabs, not a row of buttons: one track, one highlight that slides. */}
          <View className="pv-segmented">
            <Tabs
              variant="pills-raised"
              itemWidth="equal"
              size="small"
              value={String(settings.pollIntervalMinutes)}
              onChange={({ value }) => void setInterval(Number(value))}
            >
              <Tabs.List>
                {INTERVAL_OPTIONS.map((minutes) => (
                  <Tabs.Item key={minutes} value={String(minutes)}>
                    {minutes} min
                  </Tabs.Item>
                ))}
              </Tabs.List>
            </Tabs>
          </View>
        </View>

        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            APPEARANCE
          </Text>
          <View className="pv-segmented">
            <Tabs
              variant="pills-raised"
              itemWidth="equal"
              size="small"
              value={settings.theme}
              onChange={({ value }) => void setTheme(value as ThemePreference)}
            >
              <Tabs.List>
                {THEME_OPTIONS.map(({ value, label }) => (
                  <Tabs.Item key={value} value={value}>
                    {label}
                  </Tabs.Item>
                ))}
              </Tabs.List>
            </Tabs>
          </View>
        </View>

        <Divider />

        <View direction="row" align="center" gap={3}>
          {/* `myLogin` lands with the first snapshot, so the icon is the pre-fetch stand-in. */}
          <Avatar
            color="primary"
            size={10}
            initials={myLogin === null ? undefined : myLogin.slice(0, 2).toUpperCase()}
            icon={myLogin === null ? User : undefined}
          />
          <View minWidth={0}>
            <Text variant="body-3" weight="semibold" maxLines={1}>
              {myLogin ?? 'Signed in'}
            </Text>
            <Text variant="caption-1" color="neutral-faded">
              Signed in with GitHub
            </Text>
          </View>
          <View grow />
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

      <View padding={3}>
        <Text variant="caption-1" color="neutral-faded">
          Pullover {__APP_VERSION__} · MIT © 2026 Vlad Shilov ·{' '}
          <Link
            variant="plain"
            color="inherit"
            onClick={() => void window.api.openPr('https://github.com/omgovich/pullover')}
          >
            GitHub
          </Link>
        </Text>
      </View>
    </View>
  )
}
