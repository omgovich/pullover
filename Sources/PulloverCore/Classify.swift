import Foundation

public struct ClassifyContext: Sendable {
    public var myLogin: String
    public var snoozes: [String: Snooze]
    /// Treated as "now". Injected so the classifier stays pure.
    public var now: Date

    public init(myLogin: String, snoozes: [String: Snooze] = [:], now: Date) {
        self.myLogin = myLogin
        self.snoozes = snoozes
        self.now = now
    }
}

private struct Verdict {
    var category: Category
    var reason: String
    /// Decided branch by branch rather than derived from `reason` afterwards,
    /// because whichever branch knows *why* is the only one that knows *since when*.
    var waitingSince: Date?

    static let hidden = Verdict(category: .hidden, reason: "", waitingSince: nil)
}

private func pluralize(_ n: Int, _ singular: String, _ plural: String) -> String {
    n == 1 ? singular : plural
}

/// The earliest moment this pull request can have been waiting on anybody: a
/// draft is hidden, yet reviewers can be requested while it is one, and a
/// commit's `committedDate` can predate the branch being opened at all.
private func visibleSince(_ pr: PullRequest) -> Date {
    if let ready = pr.readyForReviewAt, ready > pr.createdAt { return ready }
    return pr.createdAt
}

private func classifyReviewPR(_ pr: PullRequest, myLogin: String) -> Verdict {
    let requested = pr.buckets.contains(.reviewRequested)
    let participated = hasParticipated(pr, myLogin: myLogin)

    if requested && !participated {
        return Verdict(category: .needsReview, reason: "Review requested", waitingSince: pr.reviewRequestedAt ?? pr.createdAt)
    }

    let awaiting = threadsAwaitingMyReply(pr, myLogin: myLogin)
    if !awaiting.isEmpty {
        let word = pluralize(awaiting.count, "new reply", "new replies")
        return Verdict(
            category: .newReplies,
            reason: "\(awaiting.count) \(word)",
            waitingSince: oldestPendingReplyAt(awaiting, myLogin: myLogin) ?? pr.updatedAt
        )
    }

    if let myReview = myLatestReview(pr, myLogin: myLogin) {
        // I already reviewed, so GitHub cleared me from the reviewer list.
        // Being requested again means the author asked for another pass.
        if requested {
            // Only a request made after my review can be the one that put this
            // back on me; an older timestamp is the request I already answered,
            // meaning this one came from a team and names nobody to date it by.
            let asked = pr.reviewRequestedAt.flatMap { $0 > myReview.submittedAt ? $0 : nil } ?? pr.updatedAt
            return Verdict(category: .reReview, reason: "Re-review requested", waitingSince: asked)
        }
        if hasCommitsSince(myReview, in: pr) {
            // A backdated commit can predate my review, but a push I have not
            // seen cannot have been waiting on me since before I reviewed.
            let pushed = max(pr.lastCommitPushedAt, myReview.submittedAt)
            return Verdict(category: .reReview, reason: "New commits", waitingSince: pushed)
        }
    }

    if pr.buckets.contains(.mentions) && !requested {
        let lastActivity = myLastActivityAt(pr, myLogin: myLogin)
        // `mentionsAt` is empty when our own text scan couldn't find where (a
        // team mention, etc.) even though GitHub's search matched — fall back to
        // the PR's last activity rather than silently hiding a PR that needs us.
        let latestMention = pr.mentionsAt.last ?? pr.updatedAt
        let mentionIsNew = lastActivity.map { latestMention > $0 } ?? true
        if mentionIsNew {
            // The first mention I have not answered, not the latest: being called
            // out again today does not mean I was only called out today.
            let unanswered = lastActivity.map { last in pr.mentionsAt.first { $0 > last } } ?? pr.mentionsAt.first
            return Verdict(category: .mentioned, reason: "Mentioned", waitingSince: unanswered ?? latestMention)
        }
    }

    if participated {
        return Verdict(category: .waiting, reason: "Waiting on author", waitingSince: nil)
    }
    return .hidden
}

private func classifyOwnPR(_ pr: PullRequest, myLogin: String) -> Verdict {
    if pr.reviewDecision == .changesRequested {
        return Verdict(
            category: .myPRAction,
            reason: "Changes requested",
            waitingSince: oldestBlockingChangeRequestAt(pr) ?? pr.updatedAt
        )
    }

    // Only CONFLICTING: GitHub reports UNKNOWN while it is still computing, and
    // a freshly pushed PR would otherwise flash this reason. Conflicts usually
    // arrive when the base branch moves, which does not touch `updatedAt` —
    // there is nothing to date this from, so the last activity stands in.
    if pr.mergeable == .conflicting {
        return Verdict(category: .myPRAction, reason: "Merge conflicts", waitingSince: pr.updatedAt)
    }

    let unanswered = unansweredThreads(pr, myLogin: myLogin)
    if !unanswered.isEmpty {
        let word = pluralize(unanswered.count, "open thread", "open threads")
        return Verdict(
            category: .myPRAction,
            reason: "\(unanswered.count) \(word)",
            waitingSince: oldestPendingReplyAt(unanswered, myLogin: myLogin) ?? pr.updatedAt
        )
    }

    if pr.ciStatus == .failure {
        return Verdict(category: .myPRAction, reason: "CI is red", waitingSince: pr.lastCommitPushedAt)
    }

    if pr.reviewDecision == .approved {
        // Everything above blocks auto-merge from ever firing, so it only gets to
        // speak for the case where merging is genuinely all that is left — and
        // then the pull request is already on its way out. If a check goes red
        // later it lands back in `myPRAction`.
        if pr.hasAutoMerge { return .hidden }
        return Verdict(category: .myPRAction, reason: "Ready to merge", waitingSince: approvedSince(pr) ?? pr.updatedAt)
    }

    return Verdict(category: .waiting, reason: "Waiting on reviewers", waitingSince: nil)
}

/// Classifies one pull request. `stack` is always nil here: a stack position is
/// a separate fact, attached afterwards by the inbox.
public func classify(_ pr: PullRequest, context ctx: ClassifyContext) -> ClassifiedPullRequest {
    if pr.isDraft {
        return ClassifiedPullRequest(pr: pr, category: .hidden, reason: "", waitingSince: nil, isSnoozed: false)
    }

    let verdict = pr.authorLogin == ctx.myLogin
        ? classifyOwnPR(pr, myLogin: ctx.myLogin)
        : classifyReviewPR(pr, myLogin: ctx.myLogin)

    if verdict.category == .hidden {
        return ClassifiedPullRequest(pr: pr, category: .hidden, reason: "", waitingSince: nil, isSnoozed: false)
    }

    if let snooze = ctx.snoozes[pr.id], isSnoozeActive(pr, snooze, myLogin: ctx.myLogin, now: ctx.now) {
        return ClassifiedPullRequest(pr: pr, category: .waiting, reason: "Snoozed", waitingSince: nil, isSnoozed: true)
    }

    // Clamped once here rather than in every branch above: no verdict may name
    // a moment when the pull request was still invisible.
    let floor = visibleSince(pr)
    let waitingSince = verdict.waitingSince.map { max($0, floor) }

    return ClassifiedPullRequest(
        pr: pr,
        category: verdict.category,
        reason: verdict.reason,
        waitingSince: waitingSince,
        isSnoozed: false
    )
}

/// By section, then longest-waiting first, so a section's top row is its
/// oldest obligation rather than its noisiest. `waitingSince` is nil exactly
/// for `waiting`, whose rows fall back to newest activity; `orderSection` runs
/// after this and is the one exception, a stack following the chain not the clock.
public func inboxOrder(_ a: ClassifiedPullRequest, _ b: ClassifiedPullRequest) -> Bool {
    let ia = Category.visible.firstIndex(of: a.category) ?? Int.max
    let ib = Category.visible.firstIndex(of: b.category) ?? Int.max
    if ia != ib { return ia < ib }
    if let wa = a.waitingSince, let wb = b.waitingSince { return wa < wb }
    return a.pr.updatedAt > b.pr.updatedAt
}

public func classifyAll(_ prs: [PullRequest], context: ClassifyContext) -> [ClassifiedPullRequest] {
    // Enumerated so equal keys keep their fetch order: `sorted` is not stable.
    prs.map { classify($0, context: context) }
        .filter { $0.category != .hidden }
        .enumerated()
        .sorted { lhs, rhs in
            if inboxOrder(lhs.element, rhs.element) { return true }
            if inboxOrder(rhs.element, lhs.element) { return false }
            return lhs.offset < rhs.offset
        }
        .map(\.element)
}

public func countAttention(_ items: [ClassifiedPullRequest]) -> Int {
    items.filter { $0.category.needsAttention }.count
}
