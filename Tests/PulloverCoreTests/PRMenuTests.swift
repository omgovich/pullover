import Testing
@testable import PulloverCore

private func items(_ isSnoozed: Bool) -> [(label: String, action: PRMenuAction)] {
    prMenuEntries(isSnoozed: isSnoozed).compactMap { entry in
        if case let .item(label, action) = entry { return (label, action) }
        return nil
    }
}

private func labels(_ isSnoozed: Bool) -> [String] {
    items(isSnoozed).map(\.label)
}

@Suite("prMenuEntries") struct PRMenuTests {
    @Test("leads with the opens, then the copies, then snooze") func order() {
        #expect(labels(false) == [
            "Open on GitHub",
            "Open files changed",
            "Copy link",
            "Copy branch name",
            "Snooze until new activity",
            "Snooze for 4 hours",
            "Snooze until tomorrow",
        ])
    }

    @Test("gives every item its own verb, so none leans on the section above it") func ownVerb() {
        for label in labels(false) {
            #expect(["Open ", "Copy ", "Snooze "].contains { label.hasPrefix($0) })
        }
    }

    @Test("collapses the snooze options to Unsnooze when the pull request is snoozed") func unsnooze() {
        #expect(labels(true) == [
            "Open on GitHub",
            "Open files changed",
            "Copy link",
            "Copy branch name",
            "Unsnooze",
        ])
    }

    @Test("separates the opens, the copies and snooze into three sections") func sections() {
        let shape = prMenuEntries(isSnoozed: false).map { $0 == .separator ? "separator" : "item" }
        #expect(shape == ["item", "item", "separator", "item", "item", "separator", "item", "item", "item"])
    }

    @Test("never repeats an action") func uniqueActions() {
        for isSnoozed in [false, true] {
            let actions = items(isSnoozed).map(\.action)
            #expect(Set(actions).count == actions.count)
        }
    }
}
