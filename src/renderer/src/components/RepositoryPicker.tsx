import { Search } from 'lucide-react'
import { useState } from 'react'
import { Checkbox, Text, TextField, View } from 'reshaped/bundle'

interface Props {
  knownRepositories: string[]
  /** Selected repository names as stored: lowercased. */
  selected: string[]
  watchAll: boolean
}

/** Below this many repos the list is short enough to scan, so the filter is dead weight. */
const FILTER_THRESHOLD = 5

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

/** The owner is the same for most rows, so it recedes and the repo name carries the row. */
function RepositoryName({ fullName }: { fullName: string }): React.JSX.Element {
  const slash = fullName.indexOf('/')
  if (slash === -1)
    return (
      <Text as="span" variant="body-3">
        {fullName}
      </Text>
    )
  return (
    <Text as="span" variant="body-3">
      <Text as="span" variant="body-3" color="neutral-faded">
        {fullName.slice(0, slash + 1)}
      </Text>
      {fullName.slice(slash + 1)}
    </Text>
  )
}

export default function RepositoryPicker({
  knownRepositories,
  selected,
  watchAll,
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

  const setWatchAll = async (checked: boolean): Promise<void> => {
    await window.api.setSettings({ watchAllRepositories: checked })
  }

  const options = repositoryOptions(knownRepositories, selected)
  const needle = filter.trim().toLowerCase()
  const visible = needle === '' ? options : options.filter((r) => r.toLowerCase().includes(needle))
  const selectedCount = options.filter((r) => selected.includes(r.toLowerCase())).length

  return (
    <View gap={2} minHeight="0px">
      <View direction="row" align="center" justify="space-between" gap={2}>
        <Text variant="caption-1" weight="bold" color="neutral-faded">
          REPOSITORIES
        </Text>
        <Text variant="caption-1" color="neutral-faded" numeric>
          {watchAll ? 'All' : `${selectedCount} of ${options.length}`}
        </Text>
      </View>

      <Checkbox
        name="watch-all"
        checked={watchAll}
        onChange={({ checked }) => void setWatchAll(checked)}
      >
        Watch every repo I'm involved in
      </Checkbox>

      {error !== null && (
        <Text variant="caption-1" color="critical">
          {error}
        </Text>
      )}

      {!watchAll &&
        (options.length === 0 ? (
          <Text variant="caption-1" color="neutral-faded">
            Nothing in your inbox yet, so there's nothing to narrow.
          </Text>
        ) : (
          <>
            {options.length > FILTER_THRESHOLD && (
              <TextField
                name="repository-filter"
                icon={Search}
                variant="faded"
                placeholder="Filter repositories"
                value={filter}
                onChange={({ value }) => setFilter(value)}
              />
            )}

            {selectedCount === 0 && (
              <Text variant="caption-1" color="neutral-faded">
                Nothing ticked, so nothing shows. Tick the repos you care about.
              </Text>
            )}

            {/*
             * The list is the panel's one compressible row: as tall as its
             * rows while they fit, shrinking into its own scroll when they
             * don't, so the sections below always stay on screen.
             */}
            <View overflow="auto" minHeight="72px" gap={2}>
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
          </>
        ))}
    </View>
  )
}
