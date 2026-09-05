import type { StackCardRow } from '@core/stack'

interface Props {
  row: StackCardRow
  /** Distance from the card's left edge to the line, i.e. the avatar's centre. */
  left: number
  /** Height of the segment from the card's top edge down to the avatar. */
  aboveHeight: number
  /** Where the segment below the avatar starts; it runs to the card's edge. */
  belowTop: number
  /**
   * Caps how far a fade below runs. Worth setting only where the segment is
   * long enough that a full-length fade smears across the card — the
   * comfortable row's is around 40px. The segment above never needs it: it
   * spans the card's top padding, which is short in both layouts.
   */
  fadeBelowHeight?: number
  compact?: boolean
}

/**
 * The line behind the avatars joining a pull request to its stack, drawn
 * inside the bounds of the row that owns it. A break gets no row of its own:
 * the extra height between two cards reads as a rendering fault rather than
 * as an omission, and in compact it would break the even rhythm the layout
 * exists for. So the three states all fit the segment the row already has —
 * solid to an adjacent member, dotted across members that aren't shown, and
 * fading out where the chain carries on past the list with nothing to meet.
 *
 * `above` flips whichever variant is chosen so it runs away from the avatar:
 * the dots anchor their cycle at the seam between the two rows, the fade
 * starts opaque at the avatar.
 */
function connectorClass(compact: boolean, isGap: boolean, isOpen: boolean, above: boolean): string {
  const base = compact ? 'pv-stack-connector pv-stack-connector--compact' : 'pv-stack-connector'
  if (!isGap) return base
  const variant = isOpen ? 'fade' : 'gap'
  const suffix = above ? ` pv-stack-connector--${variant}-up` : ''
  return `${base} pv-stack-connector--${variant}${suffix}`
}

export default function StackConnector({
  row,
  left,
  aboveHeight,
  belowTop,
  fadeBelowHeight,
  compact = false,
}: Props): React.ReactNode {
  const clampBelow = row.gapBelowOpen && fadeBelowHeight !== undefined

  return (
    <>
      {row.lineAbove && (
        <div
          className={connectorClass(compact, row.gapAbove, row.gapAboveOpen, true)}
          style={{ left, top: 0, height: aboveHeight }}
          aria-hidden="true"
        />
      )}
      {row.lineBelow && (
        <div
          className={connectorClass(compact, row.gapBelow, row.gapBelowOpen, false)}
          style={
            clampBelow
              ? { left, top: belowTop, height: fadeBelowHeight }
              : { left, top: belowTop, bottom: 0 }
          }
          aria-hidden="true"
        />
      )}
    </>
  )
}
