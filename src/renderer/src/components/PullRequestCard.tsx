import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { DropdownMenuInstance } from 'reshaped/bundle'
import { formatAge } from '@core/format'
import type { ClassifiedPullRequest } from '@shared/types'
import SnoozeMenu from './SnoozeMenu'

interface Props {
  item: ClassifiedPullRequest
  now: string
  isActive: boolean
  onHover: (prId: string | null) => void
  onSelect: (prId: string) => void
  onSnoozed: (item: ClassifiedPullRequest) => void
}

/** Imperative surface App needs for keyboard navigation. */
export interface PullRequestCardHandle {
  element: HTMLElement | null
  /** Opens the snooze menu, or triggers unsnooze directly if already snoozed. */
  activateSnooze: () => void
}

const CI_LABELS = {
  success: { label: 'CI green', text: '#18ab66', bg: '#1f2a23', border: '#264431' },
  failure: { label: 'CI failing', text: '#f36a6a', bg: '#3e1f1f', border: '#5a2e29' },
  pending: { label: 'CI running', text: '#b4920c', bg: '#2c271f', border: '#453c1e' },
} as const

function initialsOf(login: string): string {
  return login.slice(0, 1).toUpperCase()
}

const PullRequestCard = forwardRef<PullRequestCardHandle, Props>(function PullRequestCard(
  { item, now, isActive, onHover, onSelect, onSnoozed }: Props,
  ref,
) {
  const { pr } = item
  const ci = pr.ciStatus === 'none' ? null : CI_LABELS[pr.ciStatus]
  const cardRef = useRef<HTMLDivElement>(null)
  const snoozeInstanceRef = useRef<DropdownMenuInstance>(null)

  useImperativeHandle(ref, () => ({
    element: cardRef.current,
    activateSnooze: () => {
      if (item.isSnoozed) {
        void window.api.unsnooze(pr.id)
      } else {
        snoozeInstanceRef.current?.open()
      }
    },
  }))

  const openPr = (event: React.MouseEvent): void => {
    event.stopPropagation()
    void window.api.openPr(pr.url)
  }

  return (
    <div
      ref={cardRef}
      className="pv-card"
      onClick={() => onSelect(pr.id)}
      onMouseEnter={() => onHover(pr.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={`pv-card-ring${isActive ? ' pv-card-ring--active' : ''}`} />

      {pr.authorAvatarUrl !== '' ? (
        <img className="pv-avatar" src={pr.authorAvatarUrl} alt="" />
      ) : (
        <div className="pv-avatar-fallback">{initialsOf(pr.authorLogin)}</div>
      )}

      <div className="pv-card-body">
        <div className="pv-meta-row">
          <span className="pv-meta-repo">{pr.repository}</span>
          <span className="pv-meta-number">#{pr.number}</span>
          <span className="pv-meta-dot">·</span>
          <span className="pv-meta-age">{formatAge(pr.updatedAt, now)}</span>
          <span className="pv-meta-spacer" />
          {ci !== null && (
            <span
              className="pv-ci-pill"
              style={{ color: ci.text, background: ci.bg, border: `1px solid ${ci.border}` }}
            >
              <span className="pv-ci-dot" />
              {ci.label}
            </span>
          )}
        </div>

        <div className="pv-title">{pr.title}</div>

        <div className="pv-footer-row">
          <span className="pv-diff">
            <span className="pv-diff-add">+{pr.additions}</span>
            <span className="pv-diff-del">{'−'}{pr.deletions}</span>
          </span>
          {item.reason !== '' && <span className="pv-reason-pill">{item.reason}</span>}

          {/*
           * Always in the flow, revealed on hover. Rendering it conditionally
           * would reflow the row every time the pointer moves between cards.
           */}
          <div
            className={`pv-card-actions${isActive ? ' pv-card-actions--active' : ''}`}
            aria-hidden={!isActive}
          >
            <SnoozeMenu
              prId={pr.id}
              isSnoozed={item.isSnoozed}
              instanceRef={snoozeInstanceRef}
              onSnoozed={() => onSnoozed(item)}
            />
            <button type="button" className="pv-review-btn" onClick={openPr} title="Review — ⏎">
              Review
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

export default PullRequestCard
