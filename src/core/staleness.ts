import type { InboxSnapshot } from '@shared/ipc'

/** Past this age, the list on screen is old enough to be worth a fetch. */
const STALE_AFTER_MS = 60_000

/**
 * Whether opening the popup should spend a fetch.
 *
 * Never while one is already running: `Inbox.refresh` queues a second pass
 * behind the in-flight one rather than joining it, so a click that landed
 * during the fetch at startup cost two identical refreshes.
 */
export function shouldRefreshOnOpen(
  snapshot: Pick<InboxSnapshot, 'status' | 'lastUpdatedAt'>,
  now: string,
): boolean {
  if (snapshot.status === 'loading') return false
  if (snapshot.lastUpdatedAt === null) return true
  return Date.parse(now) - Date.parse(snapshot.lastUpdatedAt) > STALE_AFTER_MS
}
