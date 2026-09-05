import type { TextProps, ViewProps } from 'reshaped/bundle'

export interface PillColor {
  text: NonNullable<TextProps['color']>
  background: NonNullable<ViewProps['backgroundColor']>
  /**
   * Without an edge the pills disappear on a hovered card: the hover wash and
   * every `*-faded` fill sit at the same lightness (L 0.98 in light mode, 0.24
   * in dark), separated only by a couple of hundredths of chroma. The matching
   * `*-faded` border is a step away from its fill in both modes, so it draws
   * the boundary the fill alone cannot.
   */
  border: NonNullable<ViewProps['borderColor']>
}

// Keyed off the exact reason strings `src/core/classify.ts` produces. The
// counted reasons ("3 new replies", "2 open threads") aren't listed here on
// purpose — they fall through to the default accent pair below.
const STATUS_PILL_COLORS: Record<string, PillColor> = {
  'CI is red': { text: 'critical', background: 'critical-faded', border: 'critical-faded' },
  'Changes requested': { text: 'critical', background: 'critical-faded', border: 'critical-faded' },
  'Ready to merge': { text: 'positive', background: 'positive-faded', border: 'positive-faded' },
  'Waiting on author': {
    text: 'neutral-faded',
    background: 'neutral-faded',
    border: 'neutral-faded',
  },
  'Waiting on reviewers': {
    text: 'neutral-faded',
    background: 'neutral-faded',
    border: 'neutral-faded',
  },
  Snoozed: { text: 'neutral-faded', background: 'neutral-faded', border: 'neutral-faded' },
  Mentioned: { text: 'warning', background: 'warning-faded', border: 'warning-faded' },
}

const DEFAULT_STATUS_PILL_COLOR: PillColor = {
  text: 'primary',
  background: 'primary-faded',
  border: 'primary-faded',
}

export function statusPillColor(reason: string): PillColor {
  return STATUS_PILL_COLORS[reason] ?? DEFAULT_STATUS_PILL_COLOR
}

export const CI_PILL_COLORS: Record<
  'success' | 'failure' | 'pending',
  PillColor & { label: string }
> = {
  success: {
    text: 'positive',
    background: 'positive-faded',
    border: 'positive-faded',
    label: 'CI green',
  },
  failure: {
    text: 'critical',
    background: 'critical-faded',
    border: 'critical-faded',
    label: 'CI failing',
  },
  pending: {
    text: 'warning',
    background: 'warning-faded',
    border: 'warning-faded',
    label: 'CI running',
  },
}
