import { repositorySummary } from '@core/repo-filter'
import type { McpStatus } from '@shared/ipc'
import { LAYOUT_OPTIONS, type Layout, SHORTCUT_OPTIONS, type ThemePreference } from '@shared/types'
import { Heart, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar, Button, Link, ScrollArea, Switch, Text, View } from 'reshaped/bundle'
import { useLaunchAtLogin } from '../useLaunchAtLogin'
import { useSettings } from '../useSettings'
import McpSection from './McpSection'
import PaneHeader from './PaneHeader'
import RepositoriesPane from './RepositoriesPane'
import SegmentedPicker from './SegmentedPicker'
import SettingRow from './SettingRow'
import SettingsGroup from './SettingsGroup'

interface Props {
  knownRepositories: string[]
  myLogin: string | null
  onClose: () => void
}

const INTERVAL_OPTIONS = [1, 5, 15, 30].map((minutes) => ({
  value: String(minutes),
  label: `${minutes} min`,
}))

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const SHORTCUT_PICKER_OPTIONS = [{ value: 'off', label: 'Off' }, ...SHORTCUT_OPTIONS]

/** Which screen the panel is showing. Repositories is the one that needs room of its own. */
type Pane = 'root' | 'repositories'

export default function SettingsPanel({
  knownRepositories,
  myLogin,
  onClose,
}: Props): React.JSX.Element {
  const settings = useSettings()
  const [launchAtLogin, setLaunchAtLogin] = useLaunchAtLogin()
  const [shortcutActive, setShortcutActive] = useState(true)
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null)
  const [pane, setPane] = useState<Pane>('root')

  useEffect(() => {
    void window.api.isShortcutActive().then(setShortcutActive)
  }, [])

  useEffect(() => {
    void window.api.getMcpStatus().then(setMcpStatus)
  }, [])

  const setMcpEnabled = async (enabled: boolean): Promise<void> => {
    await window.api.setSettings({ mcpServerEnabled: enabled })
    setMcpStatus(await window.api.getMcpStatus())
  }

  const setShortcut = async (accelerator: string | null): Promise<void> => {
    await window.api.setSettings({ globalShortcut: accelerator })
    setShortcutActive(await window.api.isShortcutActive())
  }

  if (settings === null) return <View padding={4} height="100%" minHeight={0} />

  const summary = repositorySummary(
    settings.watchAllRepositories,
    knownRepositories,
    settings.repositories,
  )

  if (pane === 'repositories') {
    return (
      <RepositoriesPane
        knownRepositories={knownRepositories}
        selected={settings.repositories}
        watchAll={settings.watchAllRepositories}
        onBack={() => setPane('root')}
      />
    )
  }

  return (
    <View height="100%" minHeight={0}>
      <PaneHeader back="Inbox" onBack={onClose} title="Settings" />

      <View grow minHeight="0px">
        <ScrollArea scrollableClassName="pv-settings-scroll">
          <View paddingBlock={3} paddingInline={3} gap={3}>
            <SettingsGroup>
              <SettingRow
                label="Repositories"
                value={summary}
                onClick={() => setPane('repositories')}
              />
            </SettingsGroup>

            <SettingsGroup>
              <SettingRow label="Refresh every">
                <SegmentedPicker
                  value={String(settings.pollIntervalMinutes)}
                  options={INTERVAL_OPTIONS}
                  onChange={(value) =>
                    void window.api.setSettings({ pollIntervalMinutes: Number(value) })
                  }
                />
              </SettingRow>

              <SettingRow label="Appearance">
                <SegmentedPicker
                  value={settings.theme}
                  options={THEME_OPTIONS}
                  onChange={(value) =>
                    void window.api.setSettings({ theme: value as ThemePreference })
                  }
                />
              </SettingRow>

              <SettingRow label="Layout">
                <SegmentedPicker
                  value={settings.layout}
                  options={LAYOUT_OPTIONS}
                  onChange={(value) => void window.api.setSettings({ layout: value as Layout })}
                />
              </SettingRow>

              <SettingRow
                label="Open with a shortcut"
                problem={
                  settings.globalShortcut !== null && !shortcutActive
                    ? 'Another app already uses this shortcut — pick a different one.'
                    : undefined
                }
              >
                <SegmentedPicker
                  value={settings.globalShortcut ?? 'off'}
                  options={SHORTCUT_PICKER_OPTIONS}
                  onChange={(value) => void setShortcut(value === 'off' ? null : value)}
                />
              </SettingRow>

              <SettingRow
                label="Start at login"
                description="Pullover is a menu-bar app — it opens nothing on screen."
              >
                <Switch
                  name="launch-at-login"
                  inputAttributes={{ 'aria-label': 'Start at login' }}
                  checked={launchAtLogin}
                  onChange={({ checked }) => setLaunchAtLogin(checked)}
                />
              </SettingRow>
            </SettingsGroup>

            <SettingsGroup>
              <McpSection
                enabled={settings.mcpServerEnabled}
                status={mcpStatus}
                onToggle={(enabled) => void setMcpEnabled(enabled)}
              />
            </SettingsGroup>

            <View direction="row" align="center" gap={3} paddingInline={1}>
              {/* `myLogin` lands with the first snapshot, so the icon is the pre-fetch stand-in. */}
              <Avatar
                color="primary"
                size={10}
                initials={myLogin === null ? undefined : myLogin.slice(0, 2).toUpperCase()}
                icon={myLogin === null ? User : undefined}
              />
              <View minWidth={0}>
                <Text variant="body-2" weight="semibold" maxLines={1}>
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
        </ScrollArea>
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
