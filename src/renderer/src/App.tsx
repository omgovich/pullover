import { Loader, View } from 'reshaped/bundle'
import SignIn from './components/SignIn'
import { useSnapshot } from './useSnapshot'

export default function App(): React.JSX.Element {
  const snapshot = useSnapshot()

  if (snapshot.status === 'signed-out') return <SignIn />

  if (snapshot.status === 'loading' && snapshot.items.length === 0) {
    return (
      <View height="100%" align="center" justify="center">
        <Loader size="medium" />
      </View>
    )
  }

  return (
    <View padding={4}>
      <pre>{JSON.stringify(snapshot.items.length, null, 2)}</pre>
    </View>
  )
}
