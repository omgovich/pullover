import { Button, DropdownMenu } from 'reshaped/bundle'
import type { SnoozeType } from '@shared/types'

interface Props {
  prId: string
  isSnoozed: boolean
}

const OPTIONS: Array<{ label: string; type: SnoozeType; hours?: number }> = [
  { label: 'Until someone replies', type: 'until-reply' },
  { label: 'Until new commits', type: 'until-new-commits' },
  { label: 'For 4 hours', type: 'until-time', hours: 4 },
  { label: 'Until tomorrow', type: 'until-time', hours: 24 },
]

export default function SnoozeMenu({ prId, isSnoozed }: Props): React.JSX.Element {
  if (isSnoozed) {
    return (
      <Button
        size="small"
        variant="ghost"
        onClick={() => void window.api.unsnooze(prId)}
      >
        Unsnooze
      </Button>
    )
  }

  return (
    <DropdownMenu position="bottom-end">
      <DropdownMenu.Trigger>
        {(attributes) => (
          <Button size="small" variant="ghost" attributes={attributes}>
            Snooze
          </Button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {OPTIONS.map((option) => (
          <DropdownMenu.Item
            key={option.label}
            onClick={() => void window.api.snooze(prId, option.type, option.hours)}
          >
            {option.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
