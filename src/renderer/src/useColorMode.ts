import { useEffect, useState } from 'react'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Follows the system appearance. Electron leaves `nativeTheme.themeSource` on
 * `system`, so Chromium answers this query with whatever macOS is set to, and
 * flipping the OS setting fires `change` without a restart.
 */
export function useColorMode(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light',
  )

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const update = (event: MediaQueryListEvent): void => {
      setMode(event.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', update)
    return () => {
      query.removeEventListener('change', update)
    }
  }, [])

  return mode
}
