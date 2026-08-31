import { AtSign, Clock, Eye, GitPullRequest, MessageCircle, RotateCcw } from 'lucide-react'
import type { Category } from '@shared/types'

/**
 * Icon shown before each section title in `InboxSection`. `hidden` is never
 * rendered (it has no section), so it maps to something reasonable but
 * unused rather than being excluded from the `Record`.
 */
export const CATEGORY_ICONS: Record<Category, React.ComponentType> = {
  'needs-review': Eye,
  'new-replies': MessageCircle,
  're-review': RotateCcw,
  'my-pr-action': GitPullRequest,
  mentioned: AtSign,
  waiting: Clock,
  hidden: Clock,
}
