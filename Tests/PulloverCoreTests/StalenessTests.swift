import Testing
@testable import PulloverCore

private let now = d("2026-08-10T12:00:00Z")

@Suite("shouldRefreshOnOpen") struct StalenessTests {
    @Test("fetches when nothing has been fetched yet") func neverFetched() {
        #expect(shouldRefreshOnOpen(status: .ready, lastUpdatedAt: nil, now: now))
    }

    @Test("fetches when the list on screen is over a minute old") func overAMinute() {
        #expect(shouldRefreshOnOpen(status: .ready, lastUpdatedAt: d("2026-08-10T11:58:00Z"), now: now))
    }

    @Test("leaves a list fetched moments ago alone") func fresh() {
        #expect(!shouldRefreshOnOpen(status: .ready, lastUpdatedAt: d("2026-08-10T11:59:30Z"), now: now))
    }

    @Test("asks for nothing while a fetch is already running") func whileLoading() {
        #expect(!shouldRefreshOnOpen(status: .loading, lastUpdatedAt: nil, now: now))
        #expect(!shouldRefreshOnOpen(status: .loading, lastUpdatedAt: d("2026-08-10T10:00:00Z"), now: now))
    }

    @Test("goes by the age of the list, not by whether the last attempt failed") func afterError() {
        #expect(!shouldRefreshOnOpen(status: .error, lastUpdatedAt: d("2026-08-10T11:59:55Z"), now: now))
        #expect(shouldRefreshOnOpen(status: .error, lastUpdatedAt: d("2026-08-10T11:50:00Z"), now: now))
    }
}
