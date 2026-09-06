const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatAge(iso: string, now: string): string {
  const elapsed = Date.parse(now) - Date.parse(iso)
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  return `${Math.floor(elapsed / DAY)}d ago`
}

/**
 * How long until `iso`, as words for a sentence like "try again in
 * ${formatWait(...)}" — the mirror image of `formatAge`, needed because a
 * rate-limit reset is the one place Pullover talks about a moment still to
 * come rather than one already past. `formatAge(now, iso)` can't be reused
 * for this: swapping its arguments produces the right *magnitude* but the
 * wrong words ("12m ago" for a reset that hasn't happened yet), so the
 * bucketing is duplicated here rather than the suffix being patched in from
 * outside.
 *
 * Minutes round up, not down like `formatAge`'s elapsed time, so the wait
 * named here is never shorter than the real one — a user who retries right
 * when the countdown hits zero must not still get refused.
 */
export function formatWait(iso: string, now: string): string {
  const remaining = Date.parse(iso) - Date.parse(now)
  if (remaining <= MINUTE) return 'a minute'
  if (remaining < HOUR) return `${Math.ceil(remaining / MINUTE)} minutes`
  const hours = Math.ceil(remaining / HOUR)
  return hours === 1 ? '1 hour' : `${hours} hours`
}

/**
 * Just the repository, dropping the owner `nameWithOwner` carries.
 *
 * Only for display: `pr.repository` stays the full name everywhere else,
 * because that is what groups a stack, what the watch list matches against
 * and what the settings picker lists — an owner-less name would collide
 * between two organisations.
 */
export function repositoryName(fullName: string): string {
  const slash = fullName.lastIndexOf('/')
  return slash === -1 ? fullName : fullName.slice(slash + 1)
}
