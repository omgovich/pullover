import type { SnoozeType } from '@shared/types'
import { Activity, Clock, Moon, Undo2 } from 'lucide-react'
import { Button, DropdownMenu, Icon } from 'reshaped/bundle'

interface Props {
  prId: string
  isSnoozed: boolean
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

/**
 * `outline` rather than `ghost`, and no colour overrides: the pill used to
 * paint itself `background-neutral-faded`, which is the same token that tints
 * a hovered card — so it sat on a background identical to itself and all but
 * vanished. Overriding the background also suppressed Button's own hover.
 * `rounded` gives the pill shape natively; only the type scale is nudged, to
 * keep it in step with the status pills beside it.
 */
const pillStyle = {
  fontSize: '11px',
  fontWeight: 600,
}

export default function SnoozeMenu({ prId, isSnoozed, onSnoozed }: Props): React.JSX.Element {
  if (isSnoozed) {
    return (
      <Button
        variant="outline"
        color="neutral"
        size="small"
        rounded
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
    <DropdownMenu position="bottom-end">
      <DropdownMenu.Trigger>
        {(attributes) => (
          <Button
            variant="outline"
            color="neutral"
            size="small"
            rounded
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
