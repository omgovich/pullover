import type { SnoozeType } from '@shared/types'
import { Activity, Clock, Moon, Undo2 } from 'lucide-react'
import type { Ref } from 'react'
import { Button, DropdownMenu, type DropdownMenuInstance, Icon } from 'reshaped/bundle'

interface Props {
  prId: string
  isSnoozed: boolean
  /** Lets the parent card open the menu programmatically (the `S` shortcut). */
  instanceRef?: Ref<DropdownMenuInstance>
  /** Fired after a snooze option is chosen, so the card can show the undo toast. */
  onSnoozed?: () => void
}

const OPTIONS: Array<{
  label: string
  type: SnoozeType
  hours?: number
  icon: React.ComponentType
}> = [
  { label: 'Until something changes', type: 'until-activity', icon: Activity },
  { label: 'For 4 hours', type: 'until-time', hours: 4, icon: Clock },
  { label: 'Until tomorrow', type: 'until-time', hours: 24, icon: Clock },
]

// None of `Button`'s size steps land on this 21px-tall, fully-rounded pill,
// so it's set directly here.
const pillStyle = {
  height: '21px',
  minHeight: '21px',
  padding: '0 9px',
  borderRadius: '9999px',
  backgroundColor: 'var(--rs-color-background-neutral-faded)',
  color: 'var(--rs-color-foreground-neutral-faded)',
  fontSize: '11px',
  fontWeight: 600,
}

export default function SnoozeMenu({
  prId,
  isSnoozed,
  instanceRef,
  onSnoozed,
}: Props): React.JSX.Element {
  if (isSnoozed) {
    return (
      <Button
        variant="ghost"
        color="neutral"
        size="small"
        stopPropagation
        onClick={() => void window.api.unsnooze(prId)}
        attributes={{ title: 'Unsnooze', 'aria-label': 'Unsnooze', style: pillStyle }}
      >
        <Icon svg={Undo2} size="13px" />
        Unsnooze
      </Button>
    )
  }

  return (
    <DropdownMenu position="bottom-end" instanceRef={instanceRef}>
      <DropdownMenu.Trigger>
        {(attributes) => (
          <Button
            variant="ghost"
            color="neutral"
            size="small"
            stopPropagation
            attributes={{
              ...attributes,
              title: 'Snooze — S',
              'aria-label': 'Snooze',
              style: pillStyle,
            }}
          >
            <Icon svg={Moon} size="13px" />
            Snooze
          </Button>
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
