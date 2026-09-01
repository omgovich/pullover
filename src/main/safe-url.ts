/**
 * Whether `url` is safe to hand to `shell.openExternal`. Only `http:`/`https:`
 * are allowed — URLs here can be attacker-influenced (e.g. PR titles/URLs come
 * from GitHub users), and `shell.openExternal` would otherwise happily pass
 * `file:`, `javascript:`, or other schemes straight to the OS.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
