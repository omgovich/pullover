import type { TextProps } from 'reshaped/bundle'

/**
 * The accent a row's colours are drawn from. One name drives both the
 * Reshaped `color` prop and the CSS variable behind `accentTint`, so an icon
 * and the patch it sits on can never be tinted from two different hues.
 */
export type Accent = NonNullable<TextProps['color']>

// Keyed off the exact reason strings `src/core/classify.ts` produces. The
// counted reasons ("3 new replies", "2 open threads") aren't listed here on
// purpose — they fall through to the default accent below.
const STATUS_ACCENTS: Record<string, Accent> = {
  'CI is red': 'critical',
  'Changes requested': 'critical',
  'Merge conflicts': 'critical',
  'Ready to merge': 'positive',
  'Waiting on author': 'neutral-faded',
  'Waiting on reviewers': 'neutral-faded',
  Snoozed: 'neutral-faded',
  Mentioned: 'warning',
}

const DEFAULT_STATUS_ACCENT: Accent = 'primary'

export function statusAccent(reason: string): Accent {
  return STATUS_ACCENTS[reason] ?? DEFAULT_STATUS_ACCENT
}

export const CI_BADGES: Record<
  'success' | 'failure' | 'pending',
  { accent: Accent; label: string }
> = {
  success: { accent: 'positive', label: 'CI green' },
  failure: { accent: 'critical', label: 'CI failing' },
  pending: { accent: 'warning', label: 'CI running' },
}

/**
 * A translucent wash of the accent, for a badge that carries a fill and no
 * border.
 *
 * The `*-faded` background tokens cannot do this job: they sit at the same
 * lightness as the tint on a hovered card (L 0.98 in light mode, 0.24 in
 * dark) and differ only by hundredths of chroma, so a badge filled with one
 * vanishes on exactly the row the cursor is on. That is what the border used
 * to compensate for. Mixing the *foreground* accent into transparency keeps
 * the badge's chroma well clear of the neutral hover wash underneath it, so
 * the fill draws the boundary on its own.
 */
const TINT_PERCENT = 18

export function accentTint(accent: Accent): string {
  return `color-mix(in oklab, var(--rs-color-foreground-${accent}) ${TINT_PERCENT}%, transparent)`
}
