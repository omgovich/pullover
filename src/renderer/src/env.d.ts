/// <reference types="vite/client" />

import type { RendererApi } from '@shared/ipc'

declare global {
  /** App version from package.json, inlined at build time (electron.vite.config.ts). */
  const __APP_VERSION__: string
}

declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
