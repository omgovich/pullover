import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import type { BrowserConfigOptions } from 'vitest/node'

const alias = {
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@core': resolve(import.meta.dirname, 'src/core'),
}

/**
 * The browser both screenshot projects render in. They differ only in how big
 * a frame they need and where the baseline is kept, so everything that has to
 * match between them — the density, the runner, the comparator — lives here.
 */
function screenshotBrowser(
  viewport: { width: number; height: number },
  expectOptions: BrowserConfigOptions['expect'] = {},
): BrowserConfigOptions {
  return {
    enabled: true,
    // 2x is the only density this app ships at, and a hairline, a half-pixel
    // offset and a hinted glyph all resolve differently at 1x. Fidelity, not
    // sensitivity — it barely helps detection.
    provider: playwright({
      contextOptions: {
        deviceScaleFactor: 2,
        // The page the tester iframe sits in, which Playwright would
        // otherwise leave at its 1280×720 default — two pixels short of the
        // docs frame, and a frame that doesn't fit is silently scaled down
        // rather than cropped. Raised here rather than per project: the two
        // sizes have to stay independent, or a taller case in one of them
        // rescales the baselines of the other.
        viewport: { width: 1280, height: 1000 },
      },
    }),
    headless: true,
    // One instance, because the baselines are macOS/Chromium and CI runs on
    // macos-15 to match — see .github/workflows/ci.yml. The viewport has to
    // clear whatever the cases render into and still fit the headless window
    // whole: a taller tester iframe gets scaled down to fit, and every
    // screenshot then comes out at that scale.
    instances: [{ browser: 'chromium', viewport }],
    // `toMatchScreenshot` writes its own reference/actual/diff trio on a
    // failure. This one would drop a fourth PNG next to the baselines it is
    // meant to be compared against.
    screenshotFailures: false,
    expect: {
      // No mismatch budget on purpose: any ratio loose enough to absorb
      // antialiasing also absorbed a whole recoloured chip, which is measured
      // rather than assumed. If a runner ever does draw differently, set the
      // budget from the number it reports.
      toMatchScreenshot: { comparatorName: 'pixelmatch' },
      ...expectOptions,
    },
  }
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
          // The default 414px viewport would crop the 440px shell the cases
          // render into.
          browser: screenshotBrowser({ width: 640, height: 640 }),
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        // Never drawn here — the panel isn't reachable without a click — but
        // `App` pulls the module in, so the constant still has to exist.
        define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
        test: {
          name: 'docs',
          include: ['src/renderer/**/*.docs.test.tsx'],
          setupFiles: ['src/renderer/src/test/setup.ts'],
          // Big enough for the whole staged desktop: a 440×620 popup with a
          // menu bar over it and margins around it.
          browser: screenshotBrowser(
            { width: 800, height: 820 },
            {
              toMatchScreenshot: {
                comparatorName: 'pixelmatch',
                // The baseline *is* the picture README shows, so it goes where
                // README already points instead of into `__screenshots__`. That
                // is the whole trick: `npm test` then reports documentation
                // that has fallen behind the interface as a failing screenshot.
                resolveScreenshotPath: ({ root, arg, ext }) => `${root}/docs/${arg}${ext}`,
              },
            },
          ),
        },
      },
    ],
  },
})
