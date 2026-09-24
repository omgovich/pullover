import Testing
@testable import PulloverCore

// Only the pure string-building from tray.test.ts; the refresh and update menu
// items have no PulloverCore counterpart.
@Suite struct TrayTests {
    @Suite("badgeTitle") struct BadgeTitle {
        @Test("shows no title for zero, leaving the bar to the icon alone") func zero() {
            #expect(badgeTitle(count: 0) == "")
        }

        @Test("reads \"1 PR\" for exactly one") func one() {
            #expect(badgeTitle(count: 1) == "1 PR")
        }

        @Test("reads \"<n> PRs\" for anything else") func many() {
            #expect(badgeTitle(count: 16) == "16 PRs")
        }
    }

    @Suite("trayStatusLine") struct StatusLine {
        let now = d("2026-09-02T12:00:00Z")
        let base = InboxSnapshot(
            status: .ready,
            items: [],
            attentionCount: 0,
            lastUpdatedAt: d("2026-09-02T11:55:00Z"),
            errorMessage: nil,
            myLogin: "vlad",
            knownRepositories: []
        )

        func with(_ configure: (inout InboxSnapshot) -> Void) -> InboxSnapshot {
            var snapshot = base
            configure(&snapshot)
            return snapshot
        }

        @Test("says a refresh is running, matching the spinner in the window") func refreshing() {
            #expect(trayStatusLine(with { $0.status = .loading }, now: now) == "Refreshing…")
        }

        @Test("reports how stale the data is when idle") func idle() {
            #expect(trayStatusLine(base, now: now) == "Updated 5m ago")
        }

        @Test("reports a failed refresh without the raw API message") func failed() {
            #expect(trayStatusLine(with { $0.status = .error; $0.errorMessage = "boom" }, now: now) == "Couldn't refresh")
        }

        @Test("still reports staleness when a ready snapshot carries a warning") func readyWithWarning() {
            #expect(trayStatusLine(with { $0.errorMessage = "status-im hasn't approved Pullover" }, now: now) == "Updated 5m ago")
        }

        @Test("prefers the running refresh over a previous error") func loadingOverError() {
            #expect(trayStatusLine(with { $0.status = .loading; $0.errorMessage = "boom" }, now: now) == "Refreshing…")
        }

        @Test("says so before the first fetch") func notFetched() {
            #expect(trayStatusLine(with { $0.lastUpdatedAt = nil }, now: now) == "Not fetched yet")
        }

        @Test("says so when signed out") func signedOut() {
            #expect(trayStatusLine(with { $0.status = .signedOut }, now: now) == "Not signed in")
        }
    }
}
