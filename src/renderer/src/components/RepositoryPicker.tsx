import { repositoryOptions } from '@core/repo-filter'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Checkbox, ScrollArea, Text, TextField, View } from 'reshaped/bundle'
import SettingsGroup from './SettingsGroup'

interface Props {
  knownRepositories: string[]
  /** Selected repository names as stored: lowercased. */
  selected: string[]
}

/** The owner is the same for most rows, so it recedes and the repo name carries the row. */
function RepositoryName({ fullName }: { fullName: string }): React.JSX.Element {
  const slash = fullName.indexOf('/')
  if (slash === -1)
    return (
      <Text as="span" variant="body-2">
        {fullName}
      </Text>
    )
  return (
    <Text as="span" variant="body-2">
      <Text as="span" variant="body-2" color="neutral-faded">
        {fullName.slice(0, slash + 1)}
      </Text>
      {fullName.slice(slash + 1)}
    </Text>
  )
}

export default function RepositoryPicker({
  knownRepositories,
  selected,
}: Props): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const toggleRepository = async (fullName: string, checked: boolean): Promise<void> => {
    setError(null)
    try {
      if (checked) {
        await window.api.addRepository(fullName)
      } else {
        await window.api.removeRepository(fullName)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const options = repositoryOptions(knownRepositories, selected)
  const needle = filter.trim().toLowerCase()
  const visible = needle === '' ? options : options.filter((r) => r.toLowerCase().includes(needle))
  const selectedCount = options.filter((r) => selected.includes(r.toLowerCase())).length

  if (options.length === 0) {
    return (
      <Text variant="caption-1" color="neutral-faded">
        Nothing in your inbox yet, so there's nothing to narrow.
      </Text>
    )
  }

  return (
    <View gap={2} minHeight="0px">
      {/* The card hugs its rows until the screen runs out and then shrinks,
          which is what gives the list below a height to scroll within. */}
      <View minHeight="0px" overflow="hidden">
        <SettingsGroup fill>
          {/* Headless, and with no inset of its own: the card is already the
              field's edge, and the icon then lines up with the ticks below. */}
          <View paddingBlock={1}>
            <TextField
              name="repository-filter"
              icon={Search}
              variant="headless"
              placeholder="Filter repositories"
              value={filter}
              onChange={({ value }) => setFilter(value)}
              endSlot={
                <Text variant="caption-1" color="neutral-faded" numeric>
                  {selectedCount}/{options.length}
                </Text>
              }
            />
          </View>

          {/* Shrinkable rather than growing: a growing row would measure as
              nothing, and the card around it would collapse to the field. */}
          <View minHeight="0px">
            <ScrollArea scrollableClassName="pv-settings-scroll">
              <View padding={2} gap={2}>
                {visible.length === 0 ? (
                  <Text variant="caption-1" color="neutral-faded">
                    No repository matches “{filter.trim()}”.
                  </Text>
                ) : (
                  visible.map((repo) => (
                    <Checkbox
                      key={repo}
                      name={`repository-${repo}`}
                      checked={selected.includes(repo.toLowerCase())}
                      onChange={({ checked }) => void toggleRepository(repo, checked)}
                    >
                      <RepositoryName fullName={repo} />
                    </Checkbox>
                  ))
                )}
              </View>
            </ScrollArea>
          </View>
        </SettingsGroup>
      </View>

      {error !== null && (
        <Text variant="caption-1" color="critical">
          {error}
        </Text>
      )}

      {selectedCount === 0 && (
        <Text variant="caption-1" color="neutral-faded">
          Nothing ticked, so nothing shows. Tick the repos you care about.
        </Text>
      )}
    </View>
  )
}
