import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@core': resolve(import.meta.dirname, 'src/core'),
}

const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
) as { version: string }

export default defineConfig({
  main: { resolve: { alias }, plugins: [externalizeDepsPlugin()] },
  preload: { resolve: { alias }, plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
})
