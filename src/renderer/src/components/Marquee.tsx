import { useLayoutEffect, useRef, useState } from 'react'

// A constant speed, not a constant duration: the same number of seconds for
// every title makes a barely-clipped one crawl and a very long one race.
const PX_PER_SECOND = 32
/**
 * Pause at either end of a pass. `alternate` runs the easing backwards on the
 * return, so each turnaround holds twice this before setting off again.
 */
const HOLD_SECONDS = 0.7

interface Props {
  /** Scrolls only while its row is the one under the cursor. */
  active: boolean
  children: React.ReactNode
}

/**
 * Text too wide for its slot, fading out at the edges instead of being cut,
 * and scrolling end to end while `active`.
 *
 * Goes inside whatever sets the type — the box carries no typography of its
 * own, so it inherits the `Text` it sits in.
 *
 * The fade would eat the first character of every title if it were drawn
 * inside the slot, so the box overhangs by `--pv-marquee-fade` on each side
 * and pads itself back in by the same amount (see pullover.css). The text
 * then begins where the gradient is already opaque, and a title that fits
 * shows no fade at all.
 */
export default function Marquee({ active, children }: Props): React.JSX.Element {
  const clipRef = useRef<HTMLSpanElement>(null)
  const [phase, setPhase] = useState<'off' | 'holding' | 'moving'>('off')

  // Measured per activation rather than once: whatever shares the row with
  // the text sizes what is left for it. Laid out before paint, so a row never
  // paints mid-swap.
  useLayoutEffect(() => {
    if (!active) {
      setPhase('off')
      return
    }
    const clip = clipRef.current
    const text = clip?.firstElementChild
    if (clip == null || text == null) return

    // `clientWidth` counts the padding that pays back the overhang, so the
    // slot the text actually has to fit is narrower than it reports.
    const style = getComputedStyle(clip)
    const slot =
      clip.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight)
    const overflow = Math.max(0, text.scrollWidth - slot)
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
  }, [active])

  return (
    <span
      ref={clipRef}
      className={`pv-marquee${phase !== 'off' ? ' pv-marquee--active' : ''}${
        phase === 'moving' ? ' pv-marquee--moving' : ''
      }`}
    >
      <span className="pv-marquee-text">{children}</span>
    </span>
  )
}
