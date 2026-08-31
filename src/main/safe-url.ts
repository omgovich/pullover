/**
 * Whether `url` is safe to hand to `shell.openExternal`.
 *
 * Only `http:`/`https:` are allowed — `shell.openExternal` will otherwise
 * happily pass `file:`, `javascript:`, or arbitrary custom schemes to the
 * OS, and renderer-supplied strings here can be attacker-influenced (e.g.
 * PR titles/URLs come from GitHub users).
 *
 * No Electron import here on purpose: this stays importable from the test
 * path without dragging Electron into it (nothing currently does, and
 * nothing should).
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
