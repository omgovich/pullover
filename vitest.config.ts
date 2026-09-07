import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const alias = {
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@core': resolve(import.meta.dirname, 'src/core'),
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        // `SettingsPanel` prints this, and electron.vite.config.ts inlines the
        // real version at build time. A placeholder rather than that version
        // on purpose: the real one would put every release commit in the
        // business of re-recording the settings baselines.
        define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
        test: {
          name: 'visual',
          include: ['src/renderer/**/*.screenshot.test.tsx'],
          setupFiles: ['src/renderer/src/test/setup.ts'],
          browser: {
            enabled: true,
            // 2x, because that is the only density this app ever renders at:
            // it ships for macOS only, and every Mac still supported has a
            // Retina display. The point is fidelity, not sensitivity — a
            // hairline border, a half-pixel offset or a hinted glyph resolves
            // differently at 1x, so 1x baselines would hold a rendering no
            // user ever sees. It buys very little detection on its own:
            // recolouring the CI chip moves 6 pixels here against 5 at 1x,
            // since the extra edge pixels are also softer ones.
            provider: playwright({ contextOptions: { deviceScaleFactor: 2 } }),
            headless: true,
            // One instance, because the baselines are macOS/Chromium and CI
            // runs on macos-15 to match — see AGENTS.md. The viewport has to
            // clear the 440px shell the cases render into (the default 414px
            // would crop it) and still fit the headless window whole: a
            // taller tester iframe gets scaled down to fit, and every
            // screenshot then comes out at that scale.
            instances: [{ browser: 'chromium', viewport: { width: 640, height: 640 } }],
            // `toMatchScreenshot` writes its own reference/actual/diff trio
            // on a failure. This one would drop a fourth PNG next to the
            // baselines it is meant to be compared against.
            screenshotFailures: false,
            expect: {
              // No mismatch budget on purpose. A ratio generous enough to
              // absorb antialiasing also absorbs a whole recoloured 16px
              // chip on a 440x30 image — measured, not guessed. pixelmatch
              // still ignores sub-threshold wobble pixel by pixel, so what
              // is left to count is real ink. If the runner does turn out to
              // draw differently, set a budget from the number it reports
              // rather than from a guess.
              toMatchScreenshot: { comparatorName: 'pixelmatch' },
            },
          },
        },
      },
    ],
  },
})
