const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Elapsed time as the coarsest unit that fits: `10d`, `3h`, `30m`, or `<1m`
 * below a minute, since neither caller has room for `0m`.
 */
function elapsedSince(iso: string, now: string): string {
  const elapsed = Date.parse(now) - Date.parse(iso)
  if (elapsed < MINUTE) return '<1m'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`
  return `${Math.floor(elapsed / DAY)}d`
}

export function formatAge(iso: string, now: string): string {
  const elapsed = Date.parse(now) - Date.parse(iso)
  if (elapsed < MINUTE) return 'just now'
  return `${elapsedSince(iso, now)} ago`
}

/**
 * How long a pull request has been waiting on the user — `waiting 10d`, which
 * says what `10d ago` cannot: that the ball has been in their court that whole
 * time, not merely that somebody touched the thread then.
 */
export function formatWaiting(iso: string, now: string): string {
  return `waiting ${elapsedSince(iso, now)}`
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
