/**
 * The popup's visible card and the transparent padding its drop shadow needs
 * around it.
 *
 * The BrowserWindow (src/main/window.ts) is sized to `CARD_WIDTH/HEIGHT`
 * plus this padding, and the renderer (src/renderer/src/main.tsx) writes
 * these same numbers into `--pv-window-padding-*` custom properties that
 * `.pv-shell` in pullover.css positions itself with. Sharing one module
 * instead of repeating the numbers in both places is what keeps the window
 * bounds and the card's on-screen position in agreement.
 */

/** The visible card — must match `.pv-shell`'s width/height in pullover.css. */
export const CARD_WIDTH = 452
export const CARD_HEIGHT = 620

/**
 * `.pv-shell`'s box-shadow is
 * `0 28px 64px rgba(0,0,0,0.62), 0 6px 16px rgba(0,0,0,0.45)`.
 * The first, larger layer dominates how far the shadow reaches: with no
 * horizontal offset, its 64px blur radius sets the left/right reach: its
 * 28px vertical offset pushes the blur further below the card (28 + 64 =
 * 92px) and pulls it in above (64 - 28 = 36px). Padding is sized to that
 * layer per side, rather than a single value uniform on all sides, so the
 * window is no bigger than the shadow actually needs in each direction.
 */
export const WINDOW_PADDING = {
  top: 36,
  right: 64,
  bottom: 92,
  left: 64,
} as const
