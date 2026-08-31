import { isSnoozeActive } from '@core/snooze'
import {
  compareIso,
  hasParticipated,
  myLatestReview,
  threadsAwaitingMyReply,
  unansweredThreads,
} from '@core/threads'
import {
  ATTENTION_CATEGORIES,
  VISIBLE_CATEGORIES,
  type Category,
  type ClassifiedPullRequest,
  type PullRequest,
  type Snooze,
} from '@shared/types'

export interface ClassifyContext {
  myLogin: string
  snoozes: Record<string, Snooze>
  /** ISO timestamp treated as "now". Injected so the classifier stays pure. */
  now: string
}

interface Verdict {
  category: Category
  reason: string
}

/** Russian count agreement: 1 ответ, 2 ответа, 5 ответов. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function classifyReviewPr(pr: PullRequest, myLogin: string): Verdict {
  const requested = pr.buckets.includes('review-requested')
  const participated = hasParticipated(pr, myLogin)

  if (requested && !participated) {
    return { category: 'needs-review', reason: 'Ты назначен ревьюером' }
  }

  const awaiting = threadsAwaitingMyReply(pr, myLogin)
  if (awaiting.length > 0) {
    const word = plural(awaiting.length, 'новый ответ', 'новых ответа', 'новых ответов')
    return {
      category: 'new-replies',
      reason: `${awaiting.length} ${word} в твоих тредах`,
    }
  }

  const myReview = myLatestReview(pr, myLogin)
  if (myReview !== null) {
    // I already reviewed, so GitHub cleared me from the reviewer list.
    // Being requested again means the author asked for another pass.
    if (requested) {
      return { category: 're-review', reason: 'Ревью запрошено повторно' }
    }
    if (pr.lastCommitPushedAt > myReview.submittedAt) {
      return { category: 're-review', reason: 'Новые коммиты после твоего ревью' }
    }
  }

  if (pr.buckets.includes('mentions') && !requested && !participated) {
    return { category: 'mentioned', reason: 'Тебя упомянули' }
  }

  if (participated) {
    return { category: 'waiting', reason: 'Ждёшь ответа автора' }
  }

  return { category: 'hidden', reason: '' }
}

function classifyOwnPr(pr: PullRequest, myLogin: string): Verdict {
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    return { category: 'my-pr-action', reason: 'Запрошены изменения' }
  }

  const unanswered = unansweredThreads(pr, myLogin)
  if (unanswered.length > 0) {
    const word = plural(unanswered.length, 'тред ждёт', 'треда ждут', 'тредов ждут')
    return { category: 'my-pr-action', reason: `${unanswered.length} ${word} ответа` }
  }

  if (pr.ciStatus === 'failure') {
    return { category: 'my-pr-action', reason: 'CI упал' }
  }

  if (pr.reviewDecision === 'APPROVED') {
    return { category: 'my-pr-action', reason: 'Апрувнут — можно мержить' }
  }

  return { category: 'waiting', reason: 'Ждёшь ревью' }
}

export function classify(
  pr: PullRequest,
  ctx: ClassifyContext,
): ClassifiedPullRequest {
  if (pr.isDraft) {
    return { pr, category: 'hidden', reason: '', isSnoozed: false }
  }

  const verdict =
    pr.authorLogin === ctx.myLogin
      ? classifyOwnPr(pr, ctx.myLogin)
      : classifyReviewPr(pr, ctx.myLogin)

  if (verdict.category === 'hidden') {
    return { pr, ...verdict, isSnoozed: false }
  }

  const snooze = ctx.snoozes[pr.id]
  if (snooze !== undefined && isSnoozeActive(pr, snooze, ctx.myLogin, ctx.now)) {
    return { pr, category: 'waiting', reason: 'Отложен', isSnoozed: true }
  }

  return { pr, ...verdict, isSnoozed: false }
}

export function classifyAll(
  prs: PullRequest[],
  ctx: ClassifyContext,
): ClassifiedPullRequest[] {
  return prs
    .map((pr) => classify(pr, ctx))
    .filter((item) => item.category !== 'hidden')
    .sort((a, b) => {
      const byCategory =
        VISIBLE_CATEGORIES.indexOf(a.category) -
        VISIBLE_CATEGORIES.indexOf(b.category)
      if (byCategory !== 0) return byCategory
      // Newest first. compareIso is the project's one ISO comparator.
      return compareIso(b.pr.updatedAt, a.pr.updatedAt)
    })
}

export function countAttention(items: ClassifiedPullRequest[]): number {
  return items.filter((item) => ATTENTION_CATEGORIES.includes(item.category))
    .length
}
