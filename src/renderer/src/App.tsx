import { useEffect, useState } from 'react'
import { Loader, Text, View } from 'reshaped/bundle'
import { VISIBLE_CATEGORIES } from '@shared/types'
import Header from './components/Header'
import InboxSection from './components/InboxSection'
import SettingsPanel from './components/SettingsPanel'
import SignIn from './components/SignIn'
import { useSnapshot } from './useSnapshot'

export default function App(): React.JSX.Element {
  const snapshot = useSnapshot()
  const [showSettings, setShowSettings] = useState(false)
  const [now, setNow] = useState(() => new Date().toISOString())

  // Keeps the relative ages honest without re-fetching anything.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (snapshot.status === 'signed-out') return <SignIn />

  if (showSettings) {
    return (
      <SettingsPanel
        knownRepositories={snapshot.knownRepositories}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  if (snapshot.status === 'loading' && snapshot.items.length === 0) {
    return (
      <View height="100%" align="center" justify="center">
        <Loader size="medium" />
      </View>
    )
  }

  return (
    <View height="100vh">
      <Header
        snapshot={snapshot}
        now={now}
        onOpenSettings={() => setShowSettings(true)}
      />

      <View overflow="auto" grow padding={3} gap={4}>
        {snapshot.items.length === 0 ? (
          <View align="center" justify="center" grow gap={2}>
            <Text variant="body-2" color="neutral-faded">
              Nothing to look at
            </Text>
            {snapshot.status === 'error' ? (
              <Text variant="caption-1" color="neutral-faded" align="center">
                Couldn't refresh — what you see may be stale or incomplete.
              </Text>
            ) : (
              <Text variant="caption-1" color="neutral-faded" align="center">
                Nothing needs you right now.
              </Text>
            )}
          </View>
        ) : (
          VISIBLE_CATEGORIES.map((category) => (
            <InboxSection
              key={category}
              category={category}
              items={snapshot.items.filter((item) => item.category === category)}
              seen={snapshot.seen}
              now={now}
              defaultCollapsed={category === 'waiting'}
            />
          ))
        )}
      </View>

    </View>
  )
}
