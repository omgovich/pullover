import Foundation

/// Past this age, the list on screen is old enough to be worth a fetch.
public let staleAfter: TimeInterval = 60

/// Whether opening the popup should spend a fetch. Never while one is already
/// running: a refresh called mid-pass queues a second pass rather than joining.
public func shouldRefreshOnOpen(status: InboxSnapshot.Status, lastUpdatedAt: Date?, now: Date) -> Bool {
    if status == .loading { return false }
    guard let lastUpdatedAt else { return true }
    return now.timeIntervalSince(lastUpdatedAt) > staleAfter
}

public extension InboxSnapshot {
    func shouldRefreshOnOpen(now: Date) -> Bool {
        PulloverCore.shouldRefreshOnOpen(status: status, lastUpdatedAt: lastUpdatedAt, now: now)
    }
}
