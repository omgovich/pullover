import type { Ref } from 'react'
import { Activity, Clock, Undo2 } from 'lucide-react'
import { Button, DropdownMenu, type DropdownMenuInstance } from 'reshaped/bundle'
import type { SnoozeType } from '@shared/types'

interface Props {
  prId: string
  isSnoozed: boolean
  /** Lets the parent card open the menu programmatically (the `S` shortcut). */
  instanceRef?: Ref<DropdownMenuInstance>
  /** Fired after a snooze option is chosen, so the card can show the undo toast. */
  onSnoozed?: () => void
}

const OPTIONS: Array<{ label: string; type: SnoozeType; hours?: number; icon: React.ComponentType }> = [
  { label: 'Until something changes', type: 'until-activity', icon: Activity },
  { label: 'For 4 hours', type: 'until-time', hours: 4, icon: Clock },
  { label: 'Until tomorrow', type: 'until-time', hours: 24, icon: Clock },
]

export default function SnoozeMenu({
  prId,
  isSnoozed,
  instanceRef,
  onSnoozed,
}: Props): React.JSX.Element {
  if (isSnoozed) {
    return (
      <Button
        variant="outline"
        color="neutral"
        size="small"
        icon={Undo2}
        stopPropagation
        onClick={() => void window.api.unsnooze(prId)}
        attributes={{ title: 'Unsnooze', 'aria-label': 'Unsnooze' }}
      />
    )
  }

  return (
    <DropdownMenu position="bottom-end" instanceRef={instanceRef}>
      <DropdownMenu.Trigger>
        {(attributes) => (
          <Button
            variant="outline"
            color="neutral"
            size="small"
            icon={Clock}
            stopPropagation
            attributes={{ ...attributes, title: 'Snooze — S', 'aria-label': 'Snooze' }}
          />
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {OPTIONS.map((option) => (
          <DropdownMenu.Item
            key={option.label}
            icon={option.icon}
            onClick={() => {
              void window.api.snooze(prId, option.type, option.hours).then(() => onSnoozed?.())
            }}
          >
            {option.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
