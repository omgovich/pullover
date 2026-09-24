import Testing
@testable import PulloverCore

private func item(
    _ category: PulloverCore.Category,
    _ configure: (inout PullRequest) -> Void = { _ in },
    reason: String = "Review requested",
    stack: StackPosition? = nil
) -> ClassifiedPullRequest {
    ClassifiedPullRequest(
        pr: makePullRequest(configure),
        category: category,
        reason: reason,
        waitingSince: category == .waiting ? nil : d("2026-08-01T10:00:00Z"),
        isSnoozed: false,
        stack: stack
    )
}

private func snapshot(
    _ items: [ClassifiedPullRequest],
    status: InboxSnapshot.Status = .ready,
    lastUpdatedAt: String? = "2026-08-01T12:00:00Z",
    errorMessage: String? = nil,
    myLogin: String? = "vlad"
) -> InboxSnapshot {
    InboxSnapshot(
        status: status,
        items: items,
        attentionCount: items.filter { $0.category != .waiting }.count,
        lastUpdatedAt: lastUpdatedAt.map(d),
        errorMessage: errorMessage,
        myLogin: myLogin,
        knownRepositories: ["acme/web"]
    )
}

@Suite("describeInbox") struct AgentViewTests {
    @Test("groups items into sections in display order and skips empty sections") func groupsSections() {
        let result = describeInbox(snapshot([
            item(.myPRAction) { $0.id = "PR_2"; $0.number = 2 },
            item(.needsReview) { $0.id = "PR_1"; $0.number = 1 },
            item(.needsReview) { $0.id = "PR_3"; $0.number = 3 },
        ]), includeWaiting: false)
        #expect(result.sections.map(\.category) == [.needsReview, .myPRAction])
        #expect(result.sections.first?.title == "Needs your review")
        #expect(result.sections.first?.pullRequests.map(\.number) == [1, 3])
    }

    @Test("orders a stack as a chain, the way the window does") func ordersStack() {
        let result = describeInbox(snapshot([
            item(.needsReview, { $0.id = "PR_tip"; $0.number = 20 }, stack: StackPosition(id: "PR_root", index: 2, total: 2)),
            item(.needsReview, { $0.id = "PR_root"; $0.number = 10 }, stack: StackPosition(id: "PR_root", index: 1, total: 2)),
        ]), includeWaiting: false)
        #expect(result.sections.first?.pullRequests.map(\.number) == [10, 20])
    }

    @Test("leaves the waiting section out unless asked for it") func waitingOptIn() {
        let items = [
            item(.needsReview),
            item(.waiting, { $0.id = "PR_2" }, reason: "Waiting on author"),
        ]
        #expect(describeInbox(snapshot(items), includeWaiting: false).sections.count == 1)
        #expect(describeInbox(snapshot(items), includeWaiting: true).sections.map(\.category) == [.needsReview, .waiting])
    }

    @Test("carries the header fields across") func headerFields() {
        let result = describeInbox(snapshot([item(.needsReview)]), includeWaiting: false)
        #expect(result.status == .ready)
        #expect(result.lastUpdatedAt == d("2026-08-01T12:00:00Z"))
        #expect(result.myLogin == "vlad")
        #expect(result.attentionCount == 1)
        #expect(result.notice == nil)
    }

    @Test("describes a pull request without its avatar") func withoutAvatar() throws {
        let result = describeInbox(snapshot([
            item(.needsReview, {
                $0.repository = "acme/web"
                $0.number = 12
                $0.url = "https://github.com/acme/web/pull/12"
                $0.title = "Retry writes"
                $0.authorLogin = "kate"
                $0.headRefName = "kate/retry"
                $0.baseRefName = "main"
                $0.additions = 120
                $0.deletions = 34
            }, stack: StackPosition(id: "PR_root", index: 2, total: 3)),
        ]), includeWaiting: false)
        #expect(result.sections.first?.pullRequests.first == AgentPullRequestSummary(
            repository: "acme/web",
            number: 12,
            title: "Retry writes",
            url: "https://github.com/acme/web/pull/12",
            author: "kate",
            category: .needsReview,
            reason: "Review requested",
            waitingSince: d("2026-08-01T10:00:00Z"),
            isSnoozed: false,
            stack: .init(index: 2, total: 3),
            branch: .init(head: "kate/retry", base: "main"),
            isDraft: false,
            ci: .success,
            reviewDecision: .reviewRequired,
            mergeable: .mergeable,
            size: .init(additions: 120, deletions: 34),
            updatedAt: d("2026-08-01T10:00:00Z")
        ))
        let json = try #require(String(data: ISODate.makeEncoder().encode(result), encoding: .utf8))
        #expect(!json.contains("avatars.example"))
    }

    @Test("tells a signed-out agent where to sign in") func signedOut() {
        let result = describeInbox(snapshot([], status: .signedOut, lastUpdatedAt: nil, myLogin: nil), includeWaiting: false)
        #expect(result.notice?.localizedCaseInsensitiveContains("signed out") == true)
        #expect(result.sections.isEmpty)
    }

    @Test("relays the error message when the last refresh failed") func relaysError() {
        let result = describeInbox(snapshot([item(.needsReview)], status: .error, errorMessage: "GitHub is down"), includeWaiting: false)
        #expect(result.notice == "GitHub is down")
        #expect(result.sections.count == 1)
    }

    @Test("warns on a healthy list when an org is missing from it") func missingOrg() {
        let result = describeInbox(
            snapshot([item(.needsReview)], status: .ready, errorMessage: "status-im hasn't approved Pullover"),
            includeWaiting: false
        )
        #expect(result.notice == "status-im hasn't approved Pullover")
        #expect(result.sections.count == 1)
    }

    @Test("says the list is the last completed one while a refresh runs") func refreshing() {
        let result = describeInbox(snapshot([], status: .loading), includeWaiting: false)
        #expect(result.notice?.localizedCaseInsensitiveContains("last completed") == true)
    }

    @Test("does not claim a completed result when the first fetch is still running") func firstFetch() {
        let result = describeInbox(snapshot([], status: .loading, lastUpdatedAt: nil), includeWaiting: false)
        #expect(result.notice?.localizedCaseInsensitiveContains("nothing to show yet") == true)
    }
}
