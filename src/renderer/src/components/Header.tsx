import { RefreshCw, Settings } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'
import { formatAge } from '@core/format'
import type { InboxSnapshot } from '@shared/ipc'

interface Props {
  snapshot: InboxSnapshot
  now: string
  refreshing: boolean
  onRefresh: () => void
  onOpenSettings: () => void
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
  return `${snapshot.errorMessage} · last updated ${formatAge(snapshot.lastUpdatedAt, now)}`
}

export default function Header({
  snapshot,
  now,
  refreshing,
  onRefresh,
  onOpenSettings,
}: Props): React.JSX.Element {
  const hasError = snapshot.errorMessage !== null

  return (
    <View
      className="pv-header"
      direction="row"
      align="start"
      justify="space-between"
      gap={3}
      backgroundColor="elevation-raised"
      borderColor="neutral"
      borderBottom
    >
      <View className="pv-header-left" direction="row" align="baseline">
        {snapshot.attentionCount > 0 ? (
          <>
            <Text as="span" className="pv-header-count">
              {snapshot.attentionCount}
            </Text>
            <Text as="span" variant="body-2" weight="semibold" color="neutral">
              waiting on you
            </Text>
          </>
        ) : (
          <Text as="span" variant="body-2" weight="semibold" color="neutral">
            All clear
          </Text>
        )}
        <View className="pv-header-status" direction="row" align="center">
          <View
            className={`pv-dot${hasError ? ' pv-dot--negative' : ''}`}
            borderRadius="circular"
          />
          {/* No `variant`: this row is 11px, between caption-1 (12px) and
              caption-2 (10px) — the size comes from the `.pv-header-status`
              class instead. */}
          <Text as="span" color="neutral-faded">
            {statusText(snapshot, now)}
          </Text>
        </View>
      </View>

      {/*
       * Not `Button`: its hover/press feedback is painted by an internal
       * overlay element whose color comes from a `--rs-button-highlight-color`
       * set per variant/color combination (none of which is this exact
       * transparent-resting, #ffffff14-hover, accent-tinted-busy treatment),
       * and that overlay isn't reachable through `className` to retarget.
       * `variant="outline"` also resolves to a real background
       * (`--rs-color-background-elevation-base`, oklch 0.2) instead of this
       * button's transparent rest state, which sits over the header's own
       * `elevation-raised` (oklch 0.22) — a visibly different rectangle, not
       * a token swap.
       */}
      <View className="pv-header-actions" direction="row" align="center">
        <button
          type="button"
          className={`pv-icon-btn${refreshing ? ' pv-icon-btn--busy' : ''}`}
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh — R"
          aria-label="Refresh — R"
        >
          <Icon svg={RefreshCw} size={16} className={refreshing ? 'pv-spin' : undefined} />
        </button>
        <button
          type="button"
          className="pv-icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <Icon svg={Settings} size={16} />
        </button>
      </View>
    </View>
  )
}
