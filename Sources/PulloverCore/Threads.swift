import Foundation

public func lastComment(_ thread: ReviewThread) -> ThreadComment? {
    thread.comments.last
}

/// Resolved threads are dropped here and nowhere else. Every rule in the app
/// reads threads through this function so the "resolved is invisible"
/// guarantee holds in one place.
public func unresolvedThreads(_ pr: PullRequest) -> [ReviewThread] {
    pr.reviewThreads.filter { !$0.isResolved }
}

/// Unresolved threads I commented in, where somebody else spoke last.
public func threadsAwaitingMyReply(_ pr: PullRequest, myLogin: String) -> [ReviewThread] {
    unresolvedThreads(pr).filter { thread in
        let iCommented = thread.comments.contains { $0.authorLogin == myLogin }
        guard iCommented, let last = lastComment(thread) else { return false }
        return last.authorLogin != myLogin
    }
}

/// Unresolved threads where somebody else spoke last, whether or not I am in
/// them. Used for my own PRs, where a reviewer's brand-new thread still needs
/// my answer.
public func unansweredThreads(_ pr: PullRequest, myLogin: String) -> [ReviewThread] {
    unresolvedThreads(pr).filter { thread in
        guard let last = lastComment(thread) else { return false }
        return last.authorLogin != myLogin
    }
}

public func myLatestReview(_ pr: PullRequest, myLogin: String) -> Review? {
    pr.reviews
        .filter { $0.authorLogin == myLogin && $0.state != .pending }
        .max { $0.submittedAt < $1.submittedAt }
}

/// Whether the branch moved past the commit `review` was made against. By SHA
/// when both sides have one: a commit's date is when it was made, not pushed,
/// so a rebased or cherry-picked commit pushed after the review can carry a
/// date from before it. By date only when either SHA is unknown.
public func hasCommitsSince(_ review: Review, in pr: PullRequest) -> Bool {
    if let reviewed = review.commitSHA, let head = pr.headSHA { return reviewed != head }
    return pr.lastCommitPushedAt > review.submittedAt
}

public func hasParticipated(_ pr: PullRequest, myLogin: String) -> Bool {
    if myLatestReview(pr, myLogin: myLogin) != nil { return true }
    if pr.reviewThreads.contains(where: { $0.comments.contains { $0.authorLogin == myLogin } }) { return true }
    return pr.conversationComments.contains { $0.authorLogin == myLogin }
}

/// When the user last did anything on this PR — reviewed, replied in a
/// thread, or commented in the conversation. Nil if they never have.
public func myLastActivityAt(_ pr: PullRequest, myLogin: String) -> Date? {
    var dates: [Date] = []
    if let review = myLatestReview(pr, myLogin: myLogin) { dates.append(review.submittedAt) }
    for thread in pr.reviewThreads {
        dates += thread.comments.filter { $0.authorLogin == myLogin }.map(\.createdAt)
    }
    dates += pr.conversationComments.filter { $0.authorLogin == myLogin }.map(\.createdAt)
    return dates.max()
}

/// When the user was first left owing an answer in `thread`: the comment
/// right after their last one — everything before it their own comment
/// answered — or the thread's first if they never spoke. Nil when they spoke last.
private func pendingSince(in thread: ReviewThread, myLogin: String) -> Date? {
    let mine = thread.comments.lastIndex { $0.authorLogin == myLogin } ?? -1
    let next = mine + 1
    return next < thread.comments.count ? thread.comments[next].createdAt : nil
}

/// The oldest answer the user owes across `threads`, or nil if they owe none.
/// Oldest at both levels, because this dates how long they have been on the
/// hook: a "bump?" today must not make last week's question read as fresh.
public func oldestPendingReplyAt(_ threads: [ReviewThread], myLogin: String) -> Date? {
    threads.compactMap { pendingSince(in: $0, myLogin: myLogin) }.min()
}

/// When this pull request became approved, or nil if no approval stands: the
/// first approval after the last request for changes, since a second reviewer
/// piling on a week later moved nothing.
public func approvedSince(_ pr: PullRequest) -> Date? {
    let others = pr.reviews.filter { $0.authorLogin != pr.authorLogin }
    let lastBlock = others.filter { $0.state == .changesRequested }.map(\.submittedAt).max()
    return others
        .filter { $0.state == .approved }
        .map(\.submittedAt)
        .filter { lastBlock == nil || $0 > lastBlock! }
        .min()
}

/// When the oldest still-standing "changes requested" review was submitted,
/// or nil if none stands. Replayed per reviewer rather than filtered by state,
/// because a review keeps the state it was submitted with forever.
public func oldestBlockingChangeRequestAt(_ pr: PullRequest) -> Date? {
    var byReviewer: [String: [Review]] = [:]
    for review in pr.reviews where review.authorLogin != pr.authorLogin {
        byReviewer[review.authorLogin, default: []].append(review)
    }

    var standing: [Date] = []
    for reviews in byReviewer.values {
        var since: Date?
        for review in reviews.sorted(by: { $0.submittedAt < $1.submittedAt }) {
            switch review.state {
            case .changesRequested:
                if since == nil { since = review.submittedAt }
            // A dismissal voids that reviewer's stance as an approval does: a
            // dismissed approval leaves them neutral, not back where they were.
            case .approved, .dismissed:
                since = nil
            case .commented, .pending:
                break
            }
        }
        if let since { standing.append(since) }
    }
    return standing.min()
}

public func hasNewReplyInMyThreads(_ pr: PullRequest, myLogin: String, since: Date) -> Bool {
    unresolvedThreads(pr).contains { thread in
        guard thread.comments.contains(where: { $0.authorLogin == myLogin }) else { return false }
        return thread.comments.contains { $0.authorLogin != myLogin && $0.createdAt > since }
    }
}
