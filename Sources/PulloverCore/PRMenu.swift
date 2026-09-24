import Foundation

public enum PRMenuAction: String, Sendable, CaseIterable {
    case open
    case openFiles
    case copyLink
    case copyBranch
    case snoozeUntilActivity
    case snooze4Hours
    case snoozeUntilTomorrow
    case unsnooze
}

public enum PRMenuEntry: Hashable, Sendable {
    case separator
    case item(label: String, action: PRMenuAction)
}

/// The card's menu, top to bottom: opens, then copies, then snooze. Every
/// label carries its own verb, so no item depends on the section above it.
///
/// "New activity" is deliberately vaguer than the wake condition in
/// `isSnoozeActive`, which is a push or a reply in a thread you are already in.
public func prMenuEntries(isSnoozed: Bool) -> [PRMenuEntry] {
    let snooze: [PRMenuEntry] = isSnoozed
        ? [.item(label: "Unsnooze", action: .unsnooze)]
        : [
            .item(label: "Snooze until new activity", action: .snoozeUntilActivity),
            .item(label: "Snooze for 4 hours", action: .snooze4Hours),
            .item(label: "Snooze until tomorrow", action: .snoozeUntilTomorrow),
        ]
    return [
        .item(label: "Open on GitHub", action: .open),
        .item(label: "Open files changed", action: .openFiles),
        .separator,
        .item(label: "Copy link", action: .copyLink),
        .item(label: "Copy branch name", action: .copyBranch),
        .separator,
    ] + snooze
}

/// Whether `url` may be handed to the system to open. PR URLs come from
/// GitHub users, and anything but http(s) — `file:`, a custom scheme — could
/// launch something other than a browser.
public func isSafeExternalURL(_ string: String) -> Bool {
    guard let url = URL(string: string), let scheme = url.scheme?.lowercased() else { return false }
    return (scheme == "http" || scheme == "https") && url.host != nil
}
