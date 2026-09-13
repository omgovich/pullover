import { Switch, View } from 'reshaped/bundle'
import PaneHeader from './PaneHeader'
import RepositoryPicker from './RepositoryPicker'
import SettingRow from './SettingRow'
import SettingsGroup from './SettingsGroup'

interface Props {
  knownRepositories: string[]
  /** Selected repository names as stored: lowercased. */
  selected: string[]
  watchAll: boolean
  onBack: () => void
}

/**
 * The repositories list, on a screen of its own. It outgrew its place among
 * the one-line settings: a filter and a row per repository need the window.
 */
export default function RepositoriesPane({
  knownRepositories,
  selected,
  watchAll,
  onBack,
}: Props): React.JSX.Element {
  return (
    <View height="100%" minHeight={0}>
      <PaneHeader back="Settings" onBack={onBack} title="Repositories" />

      {/* The screen does not scroll: the repository list scrolls inside its
          own card, so the filter above it stays where the eye left it. */}
      <View grow minHeight="0px">
        <View padding={3} gap={3} height="100%">
          <SettingsGroup>
            <SettingRow
              label="Watch all"
              description="Every repository you are involved in, now and later."
              leading={
                <Switch
                  name="watch-all"
                  inputAttributes={{ 'aria-label': 'Watch all repositories' }}
                  checked={watchAll}
                  onChange={({ checked }) =>
                    void window.api.setSettings({ watchAllRepositories: checked })
                  }
                />
              }
            />
          </SettingsGroup>

          {/* Nothing to narrow while every repository is watched, and the
                row above already says as much. */}
          {!watchAll && (
            <RepositoryPicker knownRepositories={knownRepositories} selected={selected} />
          )}
        </View>
      </View>
    </View>
  )
}
