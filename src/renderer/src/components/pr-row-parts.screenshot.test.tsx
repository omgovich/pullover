import type { CiStatus } from '@shared/types'
import { visualCase } from '../test/visual'
import { CiChip, StatusText } from './pr-row-parts'

/**
 * Both pieces are drawn identically by the two card layouts, and what they
 * are really carrying is a colour: the CI accent and the accent
 * `statusAccent` maps each reason onto. One screenshot per piece holds the
 * whole mapping, which is easier to read in a diff than a file per variant.
 */

const CI_STATUSES: CiStatus[] = ['success', 'failure', 'pending', 'none']

// Every key of `STATUS_ACCENTS` in pr-colors.ts, plus one that isn't in it —
// the counted reasons fall through to the default accent, and that fallback
// is as worth holding as the table.
const REASONS = [
  'CI is red',
  'Changes requested',
  'Merge conflicts',
  'Ready to merge',
  'Waiting on author',
  'Waiting on reviewers',
  'Snoozed',
  'Mentioned',
  '3 new replies',
]

visualCase(
  'ci-chips',
  <div style={{ display: 'flex', gap: 8, padding: 12 }}>
    {CI_STATUSES.map((status) => (
      <CiChip key={status} status={status} />
    ))}
  </div>,
)

visualCase(
  'status-text',
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12 }}>
    {REASONS.map((reason) => (
      <StatusText key={reason} reason={reason} />
    ))}
  </div>,
)
