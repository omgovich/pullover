import Foundation

private let minute: TimeInterval = 60
private let hour: TimeInterval = 60 * minute
private let day: TimeInterval = 24 * hour

/// Elapsed time as the coarsest unit that fits: `10d`, `3h`, `30m`, or `<1m`
/// below a minute, since neither caller has room for `0m`.
private func elapsed(since date: Date, now: Date) -> String {
    let elapsed = now.timeIntervalSince(date)
    if elapsed < minute { return "<1m" }
    if elapsed < hour { return "\(Int(elapsed / minute))m" }
    if elapsed < day { return "\(Int(elapsed / hour))h" }
    return "\(Int(elapsed / day))d"
}

public func formatAge(_ date: Date, now: Date) -> String {
    if now.timeIntervalSince(date) < minute { return "just now" }
    return "\(elapsed(since: date, now: now)) ago"
}

/// How long a pull request has been waiting on the user — `waiting 10d`, which
/// says what `10d ago` cannot: that the ball has been in their court all that
/// time, not that somebody touched the thread then.
public func formatWaiting(_ date: Date, now: Date) -> String {
    "waiting \(elapsed(since: date, now: now))"
}

/// How long until `date`, as words for "try again in …". Minutes round up, so
/// the wait named is never shorter than the real one — a user who retries
/// when the countdown hits zero must not still get refused.
public func formatWait(until date: Date, now: Date) -> String {
    let remaining = date.timeIntervalSince(now)
    if remaining <= minute { return "a minute" }
    if remaining < hour { return "\(Int((remaining / minute).rounded(.up))) minutes" }
    let hours = Int((remaining / hour).rounded(.up))
    return hours == 1 ? "1 hour" : "\(hours) hours"
}

/// Just the repository, dropping the owner. Only for display: everywhere else
/// the full name is what groups a stack and what the watch list matches.
public func repositoryName(_ fullName: String) -> String {
    guard let slash = fullName.lastIndex(of: "/") else { return fullName }
    return String(fullName[fullName.index(after: slash)...])
}

/// Two letters: one is ambiguous at a glance across a list of teammates.
public func initials(of login: String) -> String {
    String(login.prefix(2)).uppercased()
}
