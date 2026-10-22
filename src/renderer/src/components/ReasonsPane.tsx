import { type Provider, type Trigger, type TriggerOption, triggerOptionsFor } from '@shared/types'
import { ScrollArea, Switch, Text, View } from 'reshaped/bundle'
import PaneHeader from './PaneHeader'
import SettingRow from './SettingRow'
import SettingsGroup from './SettingsGroup'

interface Props {
  muted: Trigger[]
  provider: Provider
  onBack: () => void
}

const SECTIONS: Record<Provider, { title: string; side: TriggerOption['side'] }[]> = {
  github: [
    { title: 'Pull requests you review', side: 'review' },
    { title: 'Your pull requests', side: 'own' },
  ],
  gitlab: [
    { title: 'Merge requests you review', side: 'review' },
    { title: 'Your merge requests', side: 'own' },
  ],
}

/**
 * A switch per reason a pull request can land in the inbox for. Turning one
 * off does not hide the pull request outright: it falls through to whatever
 * else applies, which is usually Waiting on others.
 */
export default function ReasonsPane({ muted, provider, onBack }: Props): React.JSX.Element {
  return (
    <View height="100%" minHeight={0}>
      <PaneHeader back="Settings" onBack={onBack} title="Reasons" />

      <View grow minHeight="0px">
        <ScrollArea scrollableClassName="pv-settings-scroll">
          <View padding={3} gap={3}>
            {SECTIONS[provider].map(({ title, side }) => (
              <View key={side} gap={2}>
                <View paddingInline={1}>
                  <Text variant="caption-1" weight="medium" color="neutral-faded">
                    {title}
                  </Text>
                </View>
                <SettingsGroup>
                  {triggerOptionsFor(provider)
                    .filter((option) => option.side === side)
                    .map((option) => (
                      <SettingRow
                        key={option.value}
                        label={option.label}
                        description={
                          provider === 'gitlab'
                            ? (option.gitlabDescription ?? option.description)
                            : option.description
                        }
                        leading={
                          <Switch
                            name={`trigger-${option.value}`}
                            inputAttributes={{ 'aria-label': option.label }}
                            checked={!muted.includes(option.value)}
                            onChange={({ checked }) =>
                              void window.api.setTriggerMuted(option.value, !checked)
                            }
                          />
                        }
                      />
                    ))}
                </SettingsGroup>
              </View>
            ))}
          </View>
        </ScrollArea>
      </View>
    </View>
  )
}
