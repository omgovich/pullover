import type { Ref } from 'react'
import { Activity, Clock, Moon, Undo2 } from 'lucide-react'
import { Button, DropdownMenu, Icon, type DropdownMenuInstance } from 'reshaped/bundle'
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

// The labelled pill's box: none of `Button`'s size steps land on a 21px-tall,
// fully-rounded pill with this background wash, so it's set directly here.
// The hover shift the design also specifies (brighter background and text)
// isn't reachable the same way without fighting `Button`'s own cascade with
// custom CSS — this keeps its default ghost/neutral hover wash instead,
// per the project's rule that a small visual mismatch beats that.
const pillStyle = {
  height: '21px',
  minHeight: '21px',
  padding: '0 9px',
  borderRadius: '9999px',
  backgroundColor: '#ffffff14',
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
            attributes={{ ...attributes, title: 'Snooze — S', 'aria-label': 'Snooze', style: pillStyle }}
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
