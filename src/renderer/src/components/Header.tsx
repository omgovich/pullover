import { formatAge } from '@core/format'
import type { InboxSnapshot } from '@shared/ipc'
import type { UpdateState } from '@shared/types'
import { ArrowDownToLine, RefreshCw, Settings } from 'lucide-react'
import { useState } from 'react'
import { Button, Text, View } from 'reshaped/bundle'
import { isPartialInbox } from './inbox-status'
import Marquee from './Marquee'

interface Props {
  snapshot: InboxSnapshot
  now: string
  update: UpdateState
  onRefresh: () => void
  onOpenSettings: () => void
  onInstallUpdate: () => void
  noGitLabMrs?: boolean
}

function headline(snapshot: InboxSnapshot, noGitLabMrs: boolean): string {
  if (snapshot.attentionCount > 0) return 'waiting on you'
  if (isPartialInbox(snapshot)) return 'Partial inbox'
  return noGitLabMrs ? 'No MRs found' : 'All clear'
}

/**
 * Staleness must stay visible even while an error is showing — otherwise the
 * user can't tell whether the list on screen is a minute or three days old.
 */
function statusText(snapshot: InboxSnapshot, now: string): string {
  if (snapshot.errorMessage === null) {
    return snapshot.lastUpdatedAt === null
      ? 'Not fetched yet'
      : `Updated ${formatAge(snapshot.lastUpdatedAt, now)}`
  }
  if (snapshot.lastUpdatedAt === null) {
    return snapshot.errorMessage
  }
  return `Updated ${formatAge(snapshot.lastUpdatedAt, now)} · ${snapshot.errorMessage}`
}

// Button's size steps don't land on 32×32 with a 9px radius, so the box
// itself is set directly via `attributes.style` rather than through `size`.
const iconButtonStyle = {
  width: '32px',
  height: '32px',
  minWidth: '32px',
  minHeight: '32px',
  padding: 0,
  borderRadius: '9px',
}

export default function Header({
  snapshot,
  now,
  update,
  onRefresh,
  onOpenSettings,
  onInstallUpdate,
  noGitLabMrs = false,
}: Props): React.JSX.Element {
  const updateReady = update.status === 'ready' && update.version !== null
  const updateLabel = `Restart to update to ${update.version}`
  const [statusHovered, setStatusHovered] = useState(false)
  const status = statusText(snapshot, now)
  return (
    <View
      direction="row"
      align="center"
      justify="space-between"
      gap={3}
      height={13}
      paddingStart={4}
      paddingEnd={2.5}
      backgroundColor="elevation-raised"
      borderColor="neutral"
      borderBottom
      className="pv-header"
    >
      {/* `grow` does two things here, and both are needed: a row `View` wraps
          by default, and a growing child switches its parent to nowrap — so
          the buttons stay in this row — while the child itself gets
          `flex-basis: 0` and `min-width: 0`, which is what lets a long status
          line clamp instead of pushing anything aside. */}
      <View direction="row" align="center" gap={2.5} grow minWidth={0}>
        {snapshot.attentionCount > 0 && (
          // A plain View instead of `Badge`: `Badge`'s own `Text` is fixed at
          // weight="medium" with no tabular-nums, but this count needs bold
          // tabular figures.
          <View
            minWidth="26px"
            height={6}
            paddingInline={2}
            align="center"
            justify="center"
            borderRadius="medium"
            backgroundColor="neutral-faded"
          >
            <Text as="span" variant="caption-1" weight="bold" numeric color="neutral-faded">
              {snapshot.attentionCount}
            </Text>
          </View>
        )}
        <View
          direction="column"
          grow
          minWidth={0}
          attributes={{
            onMouseEnter: () => setStatusHovered(true),
            onMouseLeave: () => setStatusHovered(false),
          }}
        >
          <Text as="span" variant="body-2" weight="semibold" color="neutral" maxLines={1}>
            {headline(snapshot, noGitLabMrs)}
          </Text>
          <Text as="div" variant="caption-1" color="neutral-faded">
            {/* Keyed by the text: the line changes under the cursor every
                minute, and a fresh Marquee measures it anew. */}
            <Marquee key={status} active={statusHovered}>
              {status}
            </Marquee>
          </Text>
        </View>
      </View>

      <View direction="row" align="center" gap={1}>
        {/* The one coloured control in a row of neutral ones, so a waiting
            update is noticeable without a banner taking up the header. */}
        {/* Named rather than drawn: an icon alone said something had happened
            but not what. The label carries the news; the tooltip carries the
            version and what clicking does. Ghost like its neighbours, but in
            the accent colour, so it reads as the one piece of news here
            without turning the header into a banner. */}
        {updateReady && (
          <Button
            variant="ghost"
            color="primary"
            size="small"
            icon={ArrowDownToLine}
            onClick={onInstallUpdate}
            attributes={{
              title: updateLabel,
              'aria-label': updateLabel,
              style: { height: '32px', minHeight: '32px', borderRadius: '9px' },
            }}
          >
            New version
          </Button>
        )}

        <Button
          variant="ghost"
          color="neutral"
          size="small"
          icon={RefreshCw}
          loading={snapshot.status === 'loading'}
          onClick={onRefresh}
          attributes={{
            title: 'Refresh — R',
            'aria-label': 'Refresh — R',
            style: iconButtonStyle,
          }}
        />
        <Button
          variant="ghost"
          color="neutral"
          size="small"
          icon={Settings}
          onClick={onOpenSettings}
          attributes={{
            title: 'Settings',
            'aria-label': 'Settings',
            style: iconButtonStyle,
          }}
        />
      </View>
    </View>
  )
}
