import { useEffect, useState } from 'react'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export type ColorMode = 'light' | 'dark'

/**
 * The system appearance right now. Electron leaves `nativeTheme.themeSource`
 * on `system`, so Chromium answers this query with whatever macOS is set to.
 */
export function systemColorMode(): ColorMode {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** The system appearance, re-read whenever the user changes it. */
export function useColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>(systemColorMode)

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
