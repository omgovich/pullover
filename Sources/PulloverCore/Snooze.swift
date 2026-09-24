import Foundation

/// A snooze parks a PR in the "waiting" section. It stays active until its own
/// wake condition fires.
public func isSnoozeActive(_ pr: PullRequest, _ snooze: Snooze, myLogin: String, now: Date) -> Bool {
    switch snooze.type {
    case .untilTime:
        guard let until = snooze.until else { return false }
        return now < until
    case .untilActivity:
        return !hasNewReplyInMyThreads(pr, myLogin: myLogin, since: snooze.snoozedAt)
            && !hasNewPush(pr, since: snooze)
    }
}

/// Whether the branch moved since the snooze was set. By SHA when both sides
/// have one: a commit's date is when it was made, and a rebase or cherry-pick
/// pushes commits dated before the snooze. By date only for a snooze saved
/// before the SHA was recorded.
private func hasNewPush(_ pr: PullRequest, since snooze: Snooze) -> Bool {
    if let then = snooze.headSHA, let now = pr.headSHA { return then != now }
    return pr.lastCommitPushedAt > snooze.snoozedAt
}
