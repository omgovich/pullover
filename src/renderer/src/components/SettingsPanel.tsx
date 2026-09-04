import { SHORTCUT_OPTIONS, type ThemePreference } from '@shared/types'
import { Heart, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar, Button, Divider, Link, Switch, Tabs, Text, View } from 'reshaped/bundle'
import { useLaunchAtLogin } from '../useLaunchAtLogin'
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
  const [launchAtLogin, setLaunchAtLogin] = useLaunchAtLogin()
  const [shortcutActive, setShortcutActive] = useState(true)

  useEffect(() => {
    void window.api.isShortcutActive().then(setShortcutActive)
  }, [])

  const setShortcut = async (accelerator: string | null): Promise<void> => {
    await window.api.setSettings({ globalShortcut: accelerator })
    setShortcutActive(await window.api.isShortcutActive())
  }

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

      <View
        overflow="hidden"
        grow
        minHeight="0px"
        paddingTop={3}
        paddingBottom={3}
        paddingInline={3}
        gap={4}
      >
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

        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            OPEN WITH A SHORTCUT
          </Text>
          <View className="pv-segmented">
            <Tabs
              variant="pills-raised"
              size="small"
              itemWidth="equal"
              value={settings.globalShortcut ?? 'off'}
              onChange={({ value }) => void setShortcut(value === 'off' ? null : value)}
            >
              <Tabs.List>
                <Tabs.Item value="off">Off</Tabs.Item>
                {SHORTCUT_OPTIONS.map((option) => (
                  <Tabs.Item key={option.value} value={option.value}>
                    {option.label}
                  </Tabs.Item>
                ))}
              </Tabs.List>
            </Tabs>
          </View>
          {settings.globalShortcut !== null && !shortcutActive && (
            <Text variant="caption-1" color="critical">
              Another app already uses this shortcut — pick a different one.
            </Text>
          )}
        </View>

        <Divider />

        <View direction="row" align="center" gap={3}>
          <Switch
            name="launch-at-login"
            checked={launchAtLogin}
            onChange={({ checked }) => setLaunchAtLogin(checked)}
          />
          <View grow minWidth={0}>
            <Text variant="body-3" weight="medium">
              Start at login
            </Text>
            <Text variant="caption-1" color="neutral-faded">
              Pullover is a menu-bar app — it opens nothing on screen.
            </Text>
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

      <View
        direction="row"
        align="center"
        gap={3}
        padding={3}
        borderColor="neutral-faded"
        borderTop
        backgroundColor="elevation-raised"
      >
        <View grow minWidth={0}>
          <Text variant="caption-1" color="neutral-faded">
            Pullover {__APP_VERSION__} · MIT ·{' '}
            <Link
              variant="plain"
              color="inherit"
              onClick={() => void window.api.openPr('https://github.com/omgovich/pullover')}
            >
              Source
            </Link>
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            Built by{' '}
            <Link
              variant="plain"
              color="inherit"
              onClick={() => void window.api.openPr('https://omgovich.ru/')}
            >
              Vlad Shilov
            </Link>
          </Text>
        </View>
        {/* Not `critical`: that is the colour of Sign out just above, and an
            invitation should not wear the same paint as the destructive
            action sitting a few pixels away. */}
        <Button
          size="small"
          variant="outline"
          color="positive"
          icon={Heart}
          onClick={() => void window.api.openPr('https://github.com/sponsors/omgovich')}
          attributes={{ title: 'Support Pullover on GitHub Sponsors' }}
        >
          Sponsor
        </Button>
      </View>
    </View>
  )
}
