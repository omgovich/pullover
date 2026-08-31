import { Button, DropdownMenu } from 'reshaped/bundle'
import type { SnoozeType } from '@shared/types'

interface Props {
  prId: string
  isSnoozed: boolean
}

const OPTIONS: Array<{ label: string; type: SnoozeType; hours?: number }> = [
  { label: 'До ответа в моих тредах', type: 'until-reply' },
  { label: 'До новых коммитов', type: 'until-new-commits' },
  { label: 'На 4 часа', type: 'until-time', hours: 4 },
  { label: 'До завтра', type: 'until-time', hours: 24 },
]

export default function SnoozeMenu({ prId, isSnoozed }: Props): React.JSX.Element {
  if (isSnoozed) {
    return (
      <Button
        size="small"
        variant="ghost"
        onClick={() => void window.api.unsnooze(prId)}
      >
        Вернуть
      </Button>
    )
  }

  return (
    <DropdownMenu position="bottom-end">
      <DropdownMenu.Trigger>
        {(attributes) => (
          <Button size="small" variant="ghost" attributes={attributes}>
            Отложить
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
