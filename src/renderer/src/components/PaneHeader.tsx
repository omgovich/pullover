import { ChevronLeft } from 'lucide-react'
import { Button, Text, View } from 'reshaped/bundle'

interface Props {
  /** Where the back button goes, named after the screen it returns to. */
  back: string
  onBack: () => void
  title: string
}

/**
 * The bar at the top of every settings screen: back on the left, title in
 * the middle.
 *
 * The title is positioned against the bar rather than laid out between the
 * other two, so it stays put when the control beside it changes width.
 */
export default function PaneHeader({ back, onBack, title }: Props): React.JSX.Element {
  return (
    <View
      position="relative"
      direction="row"
      align="center"
      gap={2}
      padding={2}
      borderColor="neutral-faded"
      borderBottom
      backgroundColor="elevation-raised"
    >
      <View position="absolute" inset={0} align="center" justify="center">
        <Text variant="body-2" weight="bold">
          {title}
        </Text>
      </View>

      <Button size="small" variant="ghost" color="primary" icon={ChevronLeft} onClick={onBack}>
        {back}
      </Button>
    </View>
  )
}
