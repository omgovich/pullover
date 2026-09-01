import { RefreshCw, Settings } from 'lucide-react'
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
    <div className="pv-header">
      <div className="pv-header-left">
        {snapshot.attentionCount > 0 ? (
          <>
            <span className="pv-header-count">{snapshot.attentionCount}</span>
            <span className="pv-header-label">waiting on you</span>
          </>
        ) : (
          <span className="pv-header-label">All clear</span>
        )}
        <span className="pv-header-status">
          <span className={`pv-dot${hasError ? ' pv-dot--negative' : ''}`} />
          {statusText(snapshot, now)}
        </span>
      </div>

      <div className="pv-header-actions">
        <button
          type="button"
          className={`pv-icon-btn${refreshing ? ' pv-icon-btn--busy' : ''}`}
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh — R"
          aria-label="Refresh — R"
        >
          <RefreshCw size={16} className={refreshing ? 'pv-spin' : undefined} />
        </button>
        <button
          type="button"
          className="pv-icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
