import Foundation

/// The menu-bar title. Zero renders as no title: the bar carries a number or
/// just the glyph. That also covers every state before the first fetch, where
/// the count is zero because nothing has been counted yet.
public func badgeTitle(count: Int) -> String {
    switch count {
    case 0: ""
    case 1: "1 PR"
    default: "\(count) PRs"
    }
}

/// The disabled line at the top of the status item's menu.
public func trayStatusLine(_ snapshot: InboxSnapshot, now: Date) -> String {
    switch snapshot.status {
    case .signedOut: return "Not signed in"
    case .loading: return "Refreshing…"
    case .error: return "Couldn't refresh"
    case .ready:
        guard let updated = snapshot.lastUpdatedAt else { return "Not fetched yet" }
        return "Updated \(formatAge(updated, now: now))"
    }
}

/// The header's second line. Staleness stays visible even while an error is
/// showing — otherwise nobody can tell whether the list is a minute or three
/// days old.
public func headerStatusText(_ snapshot: InboxSnapshot, now: Date) -> String {
    guard let error = snapshot.errorMessage else {
        return snapshot.lastUpdatedAt.map { "Updated \(formatAge($0, now: now))" } ?? "Not fetched yet"
    }
    guard let updated = snapshot.lastUpdatedAt else { return error }
    return "\(error) · last updated \(formatAge(updated, now: now))"
}

/// The colour role a row's reason is drawn in.
public enum Accent: Sendable {
    case primary, critical, positive, warning, neutral
}

/// Keyed off the exact reasons `classify` produces. The counted reasons
/// ("3 new replies", "2 open threads") fall through to the default on purpose.
public func statusAccent(for reason: String) -> Accent {
    switch reason {
    case "CI is red", "Changes requested", "Merge conflicts": .critical
    case "Ready to merge": .positive
    case "Waiting on author", "Waiting on reviewers", "Snoozed": .neutral
    case "Mentioned": .warning
    default: .primary
    }
}
