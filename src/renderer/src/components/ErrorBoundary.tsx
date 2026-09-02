import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Icon, Text, View } from 'reshaped/bundle'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * The BrowserWindow is transparent (see src/main/window.ts), so an uncaught
 * error in the render tree doesn't paint a red screen of death — the window
 * just goes blank with no explanation, which has already happened once in
 * practice. This is the last line of defence between that and a crash. React
 * only supports catching render errors via `componentDidCatch`, which has no
 * hook equivalent, so this has to be a class component.
 *
 * The fallback renders its own `.pv-shell` card (see pullover.css and
 * App.tsx) rather than relying on App's — App is exactly what just threw —
 * so the window keeps its usual shape instead of collapsing to nothing.
 */
export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] crashed:', error, info.componentStack)
  }

  private reload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <View
        className="pv-shell"
        height="100%"
        direction="column"
        overflow="hidden"
        backgroundColor="elevation-overlay"
        borderRadius="large"
        border
        borderColor="neutral"
      >
        <View
          grow
          minHeight={0}
          align="center"
          justify="center"
          gap={3}
          padding={6}
          textAlign="center"
        >
          <Icon svg={TriangleAlert} size="28px" color="critical" />
          <Text variant="body-2" weight="semibold" color="neutral">
            Well, that broke.
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            {error.message}
          </Text>
          <Button color="primary" onClick={this.reload}>
            Reload
          </Button>
        </View>
      </View>
    )
  }
}
