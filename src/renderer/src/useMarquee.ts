import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

// A constant speed, not a constant duration: the same number of seconds for
// every title makes a barely-clipped one crawl and a very long one race.
const PX_PER_SECOND = 32
/**
 * Pause at either end of a pass. `alternate` runs the easing backwards on the
 * return, so each turnaround holds twice this before setting off again.
 */
const HOLD_SECONDS = 0.7

export interface Marquee {
  /** Goes on the clipping box, whose only child holds the text. */
  ref: RefObject<HTMLDivElement | null>
  className: string
}

/**
 * Scrolls a title too long for its row while that row is the active one.
 *
 * `off` for a title that fits — there is nothing to scroll, and running an
 * animation that cannot move would also swap the ellipsis for a clip on every
 * row the cursor rests on. `holding` starts the animation, whose easing sits
 * at zero, so the ellipsis survives the opening pause; only `moving` opens the
 * box to the full title.
 *
 * The box it measures must ellipsise through `.pv-marquee`, not `maxLines`:
 * that clamps with `-webkit-line-clamp`, which the marquee cannot slide.
 */
export function useMarquee(isActive: boolean): Marquee {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'off' | 'holding' | 'moving'>('off')

  // Measured per activation rather than once: whatever shares the row with the
  // title sizes what is left for it. Laid out before paint, so a row never
  // paints mid-swap.
  useLayoutEffect(() => {
    if (!isActive) {
      setPhase('off')
      return
    }
    const clip = ref.current
    const text = clip?.firstElementChild
    if (clip == null || text == null) return
    const overflow = Math.max(0, text.scrollWidth - clip.clientWidth)
    if (overflow === 0) return

    const seconds = HOLD_SECONDS * 2 + overflow / PX_PER_SECOND
    const holdPercent = (HOLD_SECONDS / seconds) * 100
    clip.style.setProperty('--pv-marquee-duration', `${seconds}s`)
    clip.style.setProperty(
      '--pv-marquee-ease',
      `linear(0 0%, 0 ${holdPercent}%, 1 ${100 - holdPercent}%, 1 100%)`,
    )
    setPhase('holding')

    const timer = setTimeout(() => setPhase('moving'), HOLD_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [isActive])

  return {
    ref,
    className: `pv-marquee${phase !== 'off' ? ' pv-marquee--active' : ''}${
      phase === 'moving' ? ' pv-marquee--moving' : ''
    }`,
  }
}
