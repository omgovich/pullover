const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatAge(iso: string, now: string): string {
  const elapsed = Date.parse(now) - Date.parse(iso)
  if (elapsed < MINUTE) return 'только что'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} мин назад`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} ч назад`
  return `${Math.floor(elapsed / DAY)} дн назад`
}

export function formatDiff(additions: number, deletions: number): string {
  return `+${additions} −${deletions}`
}
