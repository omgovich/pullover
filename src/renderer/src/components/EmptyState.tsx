import { Check, Clock, RefreshCw } from 'lucide-react'

interface Props {
  /** True when the empty state is empty because a refresh failed, not because there's nothing to do. */
  isError: boolean
  snoozedCount: number
  refreshing: boolean
  onRefresh: () => void
  onShowSnoozed: () => void
}

export default function EmptyState({
  isError,
  snoozedCount,
  refreshing,
  onRefresh,
  onShowSnoozed,
}: Props): React.JSX.Element {
  return (
    <div className="pv-empty">
      <div className="pv-empty-dots" />

      <div className="pv-empty-badge">
        <Check size={32} />
      </div>

      <div className="pv-empty-heading">{isError ? "Couldn't refresh" : 'Inbox zero'}</div>
      <div className="pv-empty-body">
        {isError
          ? "What you see may be stale or incomplete."
          : 'You have reviewed everything waiting on you. New pull requests will land here.'}
      </div>

      {snoozedCount > 0 && (
        <div className="pv-empty-stats">
          <span className="pv-stat-pill">
            <Clock size={12} />
            {snoozedCount} snoozed
          </span>
        </div>
      )}

      <div className="pv-empty-actions">
        {snoozedCount > 0 && (
          <button type="button" className="pv-btn pv-btn-ghost" onClick={onShowSnoozed}>
            Show snoozed
          </button>
        )}
        <button
          type="button"
          className="pv-btn pv-btn-accent"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={13} className={refreshing ? 'pv-spin' : undefined} />
          Check again
        </button>
      </div>
    </div>
  )
}
