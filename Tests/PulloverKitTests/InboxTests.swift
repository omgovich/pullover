import Foundation
import PulloverCore
import Testing
@testable import PulloverKit

private let NOW = d("2026-08-10T12:00:00Z")

/// Answers each fetch from a script, one entry per call (the last repeats),
/// and can hold any call until the test lets it go.
final class FakeFetch: @unchecked Sendable {
    let calls = Counter()
    private let lock = NSLock()
    private let script: [Result<FetchedPullRequests, any Error>]
    private var holds: [Int: Gate] = [:]
    private var seenLogins: [String] = []
    private var active = 0
    private var mostActive = 0

    init(_ script: [Result<FetchedPullRequests, any Error>]) { self.script = script }
    convenience init(_ prs: [PullRequest] = []) { self.init([.success(fetched(prs))]) }

    var logins: [String] { lock.withLock { seenLogins } }
    /// The most fetches that were ever in flight at once.
    var maxConcurrent: Int { lock.withLock { mostActive } }

    /// Holds call number `n` (1-based) until the returned gate opens.
    func hold(_ n: Int) -> Gate {
        lock.withLock {
            let gate = Gate()
            holds[n] = gate
            return gate
        }
    }

    var closure: Inbox.FetchPRs { { [self] _, login in try await run(login) } }

    private func run(_ login: String) async throws -> FetchedPullRequests {
        lock.withLock {
            seenLogins.append(login)
            active += 1
            mostActive = max(mostActive, active)
        }
        defer { lock.withLock { active -= 1 } }
        let n = calls.increment()
        let gate = lock.withLock { holds[n] }
        await gate?.wait()
        return try script[min(n, script.count) - 1].get()
    }
}

final class FakeLogin: @unchecked Sendable {
    let calls = Counter()
    private let logins: [String]
    private let lock = NSLock()
    private var holds: [Int: Gate] = [:]

    init(_ logins: [String] = ["vlad"]) { self.logins = logins }

    /// Holds call number `n` (1-based) until the returned gate opens.
    func hold(_ n: Int) -> Gate {
        lock.withLock {
            let gate = Gate()
            holds[n] = gate
            return gate
        }
    }

    var closure: Inbox.FetchLogin {
        { [self] _ in
            let n = calls.increment()
            await lock.withLock { holds[n] }?.wait()
            return logins[min(n, logins.count) - 1]
        }
    }
}

@MainActor
private func makeInbox(
    _ store: AppStore,
    fetch: FakeFetch = FakeFetch(),
    login: FakeLogin = FakeLogin(),
    clock: TestClock = TestClock(NOW)
) -> Inbox {
    Inbox(
        store: store,
        clientProvider: { DummyClient() },
        now: { clock.now },
        fetchPRs: fetch.closure,
        fetchLogin: login.closure
    )
}

private func rateLimitError(resetAt: Date) -> GitHubError {
    httpError(403, "API rate limit exceeded", headers: [
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Int(resetAt.timeIntervalSince1970)),
    ])
}

/// The TS suite's store watches acme/web only.
@MainActor
private func narrowStore(_ defaults: TestDefaults) -> AppStore {
    let store = defaults.makeStore()
    store.updateSettings {
        $0.repositories = ["acme/web"]
        $0.watchAllRepositories = false
    }
    return store
}

@MainActor
private func ids(_ inbox: Inbox) -> [String] {
    inbox.snapshot.items.map(\.pr.id)
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InboxFindPullRequestTests {
    let defaults = TestDefaults()

    @Test func findsAPullRequestTheRepositoryFilterHidesClassifiedOnTheSpot() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([
            pr("PR_1", repository: "acme/web", number: 1),
            pr("PR_9", repository: "acme/api", number: 9, buckets: [.reviewRequested]),
        ]))
        await inbox.refresh()

        #expect(inbox.snapshot.items.isEmpty)
        let found = inbox.findPullRequest(repository: "acme/api", number: 9)
        #expect(found?.pr.id == "PR_9")
        #expect(found?.category == .needsReview)
        #expect(found != nil && found?.stack == nil)
    }

    @Test func matchesTheRepositoryNameWhateverItsCase() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([pr("PR_1", repository: "Acme/Web")]))
        await inbox.refresh()
        #expect(inbox.findPullRequest(repository: "acme/web", number: 1)?.pr.id == "PR_1")
    }

    @Test func returnsNilForAPullRequestItHasNeverFetched() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([pr("PR_1")]))
        await inbox.refresh()
        #expect(inbox.findPullRequest(repository: "acme/web", number: 404) == nil)
    }

    @Test func returnsNilWhileSignedOut() {
        let inbox = makeInbox(narrowStore(defaults))
        inbox.clientProvider = { nil }
        #expect(inbox.findPullRequest(repository: "acme/web", number: 1) == nil)
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InboxWhenIdleTests {
    let defaults = TestDefaults()

    @Test func resolvesOnlyOnceThePassThatIsRunningHasFinished() async {
        let fetch = FakeFetch([pr("PR_1", buckets: [.reviewRequested])])
        let held = fetch.hold(1)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        let pass = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)
        #expect(inbox.snapshot.status == .loading)

        let idle = Task { await inbox.whenIdle() }
        await settle()
        held.open()
        await idle.value
        #expect(inbox.snapshot.status == .ready)
        await pass.value
    }

    @Test func waitsForAQueuedFollowUpPassTooNotJustTheOneRunning() async {
        let fetch = FakeFetch()
        let first = fetch.hold(1)
        let second = fetch.hold(2)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        let pass = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)
        let queued = Task { await inbox.refresh() }
        await settle()

        let settled = Box(false)
        let idle = Task {
            await inbox.whenIdle()
            settled.value = true
        }
        await settle()

        first.open()
        // The follow-up pass is now in flight and held, so a wait that covered
        // only the first pass would already have finished.
        await fetch.calls.waitFor(2)
        await settle()
        #expect(settled.value == false)

        second.open()
        await idle.value
        #expect(fetch.calls.count == 2)
        await pass.value
        await queued.value
    }

    // "resolves even when the pass it waited for failed": `clientProvider` cannot throw in Swift, and passes never fail.

    @Test func resolvesAtOnceWhenNoPassIsRunning() async {
        await makeInbox(narrowStore(defaults)).whenIdle()
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InboxRefreshTests {
    let defaults = TestDefaults()

    @Test func keepsTheInboxReadyWhenAnOrgHasNotApprovedTheOAuthApp() async {
        let fetch = FakeFetch([.success(FetchedPullRequests(
            prs: [pr("PR_1", buckets: [.reviewRequested])],
            restrictedOrgs: ["status-im"]
        ))])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        await inbox.refresh()

        #expect(inbox.snapshot.status == .ready)
        #expect(ids(inbox) == ["PR_1"])
        #expect(inbox.snapshot.errorMessage == "status-im hasn't approved Pullover")
    }

    @Test func classifiesFetchedPRsAndCountsTheOnesNeedingAttention() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([
            pr("PR_1", buckets: [.reviewRequested]),
            pr("PR_2", buckets: [.author]) { $0.authorLogin = "vlad" },
        ]))

        await inbox.refresh()
        let snapshot = inbox.snapshot

        #expect(snapshot.status == .ready)
        #expect(snapshot.myLogin == "vlad")
        #expect(snapshot.lastUpdatedAt == NOW)
        #expect(ids(inbox) == ["PR_1", "PR_2"])
        #expect(snapshot.attentionCount == 1)
    }

    @Test func reportsSignedOutWhenThereIsNoClient() async {
        let inbox = makeInbox(narrowStore(defaults))
        inbox.clientProvider = { nil }
        await inbox.refresh()
        #expect(inbox.snapshot.status == .signedOut)
    }

    @Test func keepsThePreviousItemsAndReportsTheErrorWhenAFetchFails() async {
        let fetch = FakeFetch([
            .success(fetched([pr("PR_1", buckets: [.reviewRequested])])),
            .failure(TestError("rate limit exceeded")),
        ])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        await inbox.refresh()
        #expect(ids(inbox) == ["PR_1"])

        await inbox.refresh()

        #expect(inbox.snapshot.status == .error)
        #expect(inbox.snapshot.errorMessage == "rate limit exceeded")
        #expect(ids(inbox) == ["PR_1"])
    }

    @Test func preservesTheLastSuccessfulUpdateTimeAcrossAFailure() async {
        let fetch = FakeFetch([
            .success(fetched([pr("PR_1", buckets: [.reviewRequested])])),
            .failure(TestError("network down")),
        ])
        // A different reading for the failing pass, so recomputing lastUpdatedAt would show.
        let clock = TestClock(d("2026-08-10T13:00:00Z"), then: [NOW])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch, clock: clock)

        await inbox.refresh()
        await inbox.refresh()

        #expect(inbox.snapshot.status == .error)
        #expect(inbox.snapshot.lastUpdatedAt == NOW)
        #expect(inbox.snapshot.items.count == 1)
    }

    @Test func notifiesSubscribersOnEveryStateChange() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([pr("PR_1", buckets: [.reviewRequested])]))
        var changes: [InboxSnapshot.Status] = []
        inbox.onChange = { changes.append($0.status) }
        await inbox.refresh()
        #expect(changes == [.loading, .ready])
    }

    @Test func fetchesTheViewerLoginOnlyOnce() async {
        let login = FakeLogin()
        let inbox = makeInbox(narrowStore(defaults), login: login)
        await inbox.refresh()
        await inbox.refresh()
        #expect(login.calls.count == 1)
    }

    /// Authored by other-user with changes requested: an attention item for
    /// other-user, invisible to vlad.
    private let otherUsersPR = pr("PR_1") {
        $0.authorLogin = "other-user"
        $0.reviewDecision = .changesRequested
    }

    @Test func clearsTheCachedLoginAndPRsOnSignOutSoASubsequentSignInReclassifiesAgainstTheNewUser() async {
        let login = FakeLogin(["vlad", "other-user"])
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([otherUsersPR]), login: login)

        await inbox.refresh()
        #expect(inbox.snapshot.myLogin == "vlad")
        #expect(inbox.snapshot.items.isEmpty)
        #expect(inbox.snapshot.attentionCount == 0)

        inbox.clientProvider = { nil }
        await inbox.refresh()
        #expect(inbox.snapshot.status == .signedOut)
        #expect(inbox.snapshot.myLogin == nil)
        #expect(inbox.snapshot.items.isEmpty)

        inbox.clientProvider = { DummyClient() }
        await inbox.refresh()

        #expect(login.calls.count == 2)
        #expect(inbox.snapshot.myLogin == "other-user")
        #expect(ids(inbox) == ["PR_1"])
        #expect(inbox.snapshot.attentionCount == 1)
    }

    @Test func clearsAPreviousErrorMessageOnSignOut() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([.failure(TestError("boom"))]))

        await inbox.refresh()
        #expect(inbox.snapshot.status == .error)
        #expect(inbox.snapshot.errorMessage == "boom")

        inbox.clientProvider = { nil }
        await inbox.refresh()

        #expect(inbox.snapshot.status == .signedOut)
        #expect(inbox.snapshot.errorMessage == nil)
    }

    @Test func queuesASingleFollowUpPassInsteadOfJoiningForARefreshRequestedWhileOneIsAlreadyRunning() async {
        let fetch = FakeFetch([pr("PR_1", buckets: [.reviewRequested])])
        let firstFetch = fetch.hold(1)
        let secondFetch = fetch.hold(2)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        let first = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)
        let second = Task { await inbox.refresh() }
        await settle()

        firstFetch.open()
        await first.value
        // The follow-up starts only after the first pass finishes.
        await fetch.calls.waitFor(2)
        secondFetch.open()
        await second.value

        #expect(fetch.calls.count == 2)
        #expect(inbox.snapshot.status == .ready)
        #expect(ids(inbox) == ["PR_1"])
    }

    @Test func clearsTheCachedLoginWhenSigningOutWhileARefreshIsInFlight() async {
        let login = FakeLogin(["vlad", "other-user"])
        let fetch = FakeFetch([otherUsersPR])
        let held = fetch.hold(1)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch, login: login)

        let first = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)

        // Sign out the way the app does: change state, then ask for a refresh.
        inbox.clientProvider = { nil }
        let second = Task { await inbox.refresh() }
        await settle()

        held.open()
        await first.value
        await second.value

        #expect(inbox.snapshot.status == .signedOut)
        #expect(inbox.snapshot.myLogin == nil)
        #expect(inbox.snapshot.items.isEmpty)

        inbox.clientProvider = { DummyClient() }
        await inbox.refresh()

        #expect(login.calls.count == 2)
        #expect(inbox.snapshot.myLogin == "other-user")
        #expect(ids(inbox) == ["PR_1"])
        #expect(inbox.snapshot.attentionCount == 1)
    }

    @Test func reflectsARepositorySelectionChangedWhileTheFetchIsInFlight() async throws {
        let store = narrowStore(defaults)
        let fetch = FakeFetch([
            pr("PR_1", repository: "acme/web", buckets: [.reviewRequested]),
            pr("PR_2", repository: "acme/api", buckets: [.reviewRequested]),
        ])
        let held = fetch.hold(1)
        let inbox = makeInbox(store, fetch: fetch)

        let pass = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)

        try store.addRepository("acme/api")
        held.open()
        await pass.value

        #expect(ids(inbox).sorted() == ["PR_1", "PR_2"])
    }

    @Test func alwaysCallsFetchPRsUnfilteredRegardlessOfTheRepositorySelection() async {
        let fetch = FakeFetch()
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)
        await inbox.refresh()
        // The Swift fetch takes no filter at all; what's left to check is the login it gets.
        #expect(fetch.logins == ["vlad"])
    }

    private let twoRepos = [
        pr("PR_1", repository: "acme/web", buckets: [.reviewRequested]),
        pr("PR_2", repository: "acme/api", buckets: [.reviewRequested]),
    ]

    @Test func narrowsItemsToTheSelectedRepositoriesWhenWatchAllRepositoriesIsOff() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch(twoRepos))
        await inbox.refresh()
        #expect(ids(inbox) == ["PR_1"])
    }

    @Test func showsEveryFetchedRepositoryWhenWatchAllRepositoriesIsOn() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.watchAllRepositories = true }
        let inbox = makeInbox(store, fetch: FakeFetch(twoRepos))
        await inbox.refresh()
        #expect(ids(inbox).sorted() == ["PR_1", "PR_2"])
    }

    @Test func populatesKnownRepositoriesFromEveryFetchedPullRequestEvenWhileANarrowFilterIsActive() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch(twoRepos))
        await inbox.refresh()
        #expect(ids(inbox) == ["PR_1"])
        #expect(inbox.snapshot.knownRepositories == ["acme/api", "acme/web"])
    }

    @Test func clearsKnownRepositoriesOnSignOut() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([pr("PR_1", buckets: [.reviewRequested])]))
        await inbox.refresh()
        #expect(inbox.snapshot.knownRepositories == ["acme/web"])

        inbox.clientProvider = { nil }
        await inbox.refresh()
        #expect(inbox.snapshot.knownRepositories.isEmpty)
    }

    @Test func coalescesSeveralRefreshesRequestedDuringOnePassIntoASingleFollowUpPass() async {
        let fetch = FakeFetch()
        let firstFetch = fetch.hold(1)
        let secondFetch = fetch.hold(2)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        let first = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)

        let others = (0..<3).map { _ in Task { await inbox.refresh() } }
        await settle()

        firstFetch.open()
        await first.value
        await fetch.calls.waitFor(2)
        secondFetch.open()
        for other in others { await other.value }

        #expect(fetch.calls.count == 2)
    }

    @Test func neverRunsTwoPassesAtOnceForARefreshArrivingJustAsTheQueuedOneIsAboutToStart() async {
        let fetch = FakeFetch()
        let firstFetch = fetch.hold(1)
        let secondFetch = fetch.hold(2)
        let thirdFetch = fetch.hold(3)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        let first = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)
        let second = Task { await inbox.refresh() }
        await settle()

        // Requested synchronously inside the first pass's final emit, so it is
        // made for certain before the queued pass starts. (Scheduling a `Task`
        // here instead would let the queued pass win the race and start first.)
        var late: Task<Void, Never>?
        inbox.onChange = { snapshot in
            guard snapshot.status == .ready, late == nil else { return }
            late = inbox.requestPass()
        }
        firstFetch.open()
        await first.value
        await fetch.calls.waitFor(2)
        await settle()
        secondFetch.open()
        thirdFetch.open()
        await second.value
        await late?.value

        #expect(late != nil)
        #expect(fetch.maxConcurrent == 1)
        // The late caller joined the queued pass rather than starting its own.
        #expect(fetch.calls.count == 2)
    }

    @Test func callsOnAuthErrorWhenARefreshFailsWithADeadTokenError() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([.failure(httpError(401, "Bad credentials"))]))
        let authErrors = Box(0)
        inbox.onAuthError = { authErrors.value += 1 }

        await inbox.refresh()

        #expect(inbox.snapshot.status == .error)
        #expect(authErrors.value == 1)
    }

    @Test func doesNotCallOnAuthErrorForAnOrdinaryNetworkFailure() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([.failure(GitHubError.network("network down"))]))
        let authErrors = Box(0)
        inbox.onAuthError = { authErrors.value += 1 }

        await inbox.refresh()

        #expect(inbox.snapshot.status == .error)
        #expect(authErrors.value == 0)
    }

    // "lets a queued refresh run ... even when the pass ahead of it throws": Swift passes cannot throw.

    @Test func attachesEachItemItsStackPosition() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.watchAllRepositories = true }
        let inbox = makeInbox(store, fetch: FakeFetch([
            pr("PR_1", buckets: [.reviewRequested]) { $0.headRefName = "part-1"; $0.baseRefName = "main" },
            pr("PR_2", buckets: [.reviewRequested]) { $0.headRefName = "part-2"; $0.baseRefName = "part-1" },
            pr("PR_3", buckets: [.reviewRequested]),
        ]))

        await inbox.refresh()
        let byId = Dictionary(uniqueKeysWithValues: inbox.snapshot.items.map { ($0.pr.id, $0) })

        #expect(byId["PR_1"]?.stack == StackPosition(id: "PR_1", index: 1, total: 2))
        #expect(byId["PR_2"]?.stack == StackPosition(id: "PR_1", index: 2, total: 2))
        #expect(byId["PR_3"] != nil && byId["PR_3"]?.stack == nil)
    }

    @Test func keepsAStackWholeWhenItsMiddlePRIsMergingAutomatically() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.watchAllRepositories = true }
        func mine(_ id: String, _ head: String, _ base: String, _ configure: (inout PullRequest) -> Void = { _ in }) -> PullRequest {
            pr(id, buckets: [.author]) {
                $0.authorLogin = "vlad"
                $0.headRefName = head
                $0.baseRefName = base
                configure(&$0)
            }
        }
        let inbox = makeInbox(store, fetch: FakeFetch([
            mine("PR_1", "part-1", "main"),
            mine("PR_2", "part-2", "part-1") {
                $0.reviewDecision = .approved
                $0.hasAutoMerge = true
            },
            mine("PR_3", "part-3", "part-2"),
        ]))

        await inbox.refresh()
        let items = inbox.snapshot.items

        #expect(ids(inbox) == ["PR_1", "PR_3"])
        #expect(items.first { $0.pr.id == "PR_1" }?.stack == StackPosition(id: "PR_1", index: 1, total: 3))
        #expect(items.first { $0.pr.id == "PR_3" }?.stack == StackPosition(id: "PR_1", index: 3, total: 3))
    }

    @Test func keepsAStackWholeEvenWhenOneOfItsPRsIsFilteredOutOfTheClassifiedItems() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.watchAllRepositories = true }
        let inbox = makeInbox(store, fetch: FakeFetch([
            pr("PR_1", buckets: [.reviewRequested]) { $0.headRefName = "part-1"; $0.baseRefName = "main" },
            pr("PR_2") { $0.isDraft = true; $0.headRefName = "part-2"; $0.baseRefName = "part-1" },
            pr("PR_3", buckets: [.reviewRequested]) { $0.headRefName = "part-3"; $0.baseRefName = "part-2" },
        ]))

        await inbox.refresh()
        let items = inbox.snapshot.items

        #expect(ids(inbox) == ["PR_1", "PR_3"])
        #expect(items.first { $0.pr.id == "PR_1" }?.stack == StackPosition(id: "PR_1", index: 1, total: 3))
        #expect(items.first { $0.pr.id == "PR_3" }?.stack == StackPosition(id: "PR_1", index: 3, total: 3))
    }

    @Test func doesNotApplyAFetchThatLandsAfterSignOut() async {
        // Swift-only guard: a pass whose fetch outlives the sign-out drops its result.
        let fetch = FakeFetch([pr("PR_1", buckets: [.reviewRequested])])
        let held = fetch.hold(1)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        let pass = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)
        inbox.clientProvider = { nil }
        held.open()
        await pass.value

        #expect(inbox.snapshot.items.isEmpty)
        #expect(inbox.findPullRequest(repository: "acme/web", number: 1) == nil)
    }

    @Test func doesNotApplyAFetchBegunUnderThePreviousAccount() async {
        // Signed out and back in as someone else while the old pass was in flight:
        // a client is present again, but the old pass's result is not this account's.
        let fetch = FakeFetch([
            .success(fetched([pr("OLD", buckets: [.reviewRequested])])),
            .success(fetched([pr("NEW", buckets: [.reviewRequested])])),
        ])
        let oldFetch = fetch.hold(1)
        let newFetch = fetch.hold(2)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch, login: FakeLogin(["old-user", "new-user"]))

        let old = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)
        inbox.sessionDidChange()
        let new = Task { await inbox.refresh() }
        await settle()
        oldFetch.open()
        await old.value

        // Between the passes: nothing of the old account's was applied.
        #expect(ids(inbox).isEmpty)
        #expect(inbox.snapshot.myLogin == nil)
        #expect(inbox.findPullRequest(repository: "acme/web", number: 1) == nil)

        await fetch.calls.waitFor(2)
        newFetch.open()
        await new.value
        #expect(fetch.logins == ["old-user", "new-user"])
        #expect(inbox.snapshot.myLogin == "new-user")
        #expect(ids(inbox) == ["NEW"])
    }

    @Test func doesNotKeepALoginFetchedUnderThePreviousAccount() async {
        let fetch = FakeFetch([pr("PR_1", buckets: [.reviewRequested])])
        let login = FakeLogin(["old-user", "new-user"])
        let oldLogin = login.hold(1)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch, login: login)

        let old = Task { await inbox.refresh() }
        await login.calls.waitFor(1)
        inbox.sessionDidChange()
        let new = Task { await inbox.refresh() }
        await settle()
        oldLogin.open()
        await old.value
        await new.value

        #expect(fetch.logins == ["new-user"])
        #expect(inbox.snapshot.myLogin == "new-user")
    }

    @Test func ignoresAnAuthErrorFromThePreviousAccountsToken() async {
        let fetch = FakeFetch([
            .failure(httpError(401, "Bad credentials")),
            .success(fetched([pr("NEW", buckets: [.reviewRequested])])),
        ])
        let held = fetch.hold(1)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)
        let authErrors = Box(0)
        inbox.onAuthError = { authErrors.value += 1 }

        let old = Task { await inbox.refresh() }
        await fetch.calls.waitFor(1)
        inbox.sessionDidChange()
        held.open()
        await old.value

        #expect(authErrors.value == 0)
        #expect(inbox.snapshot.status != .error)

        await inbox.refresh()
        #expect(inbox.snapshot.status == .ready)
        #expect(ids(inbox) == ["NEW"])
    }

    @Test func forgetsTheAccountWhenTheSessionChanges() async {
        let login = FakeLogin(["old-user", "new-user"])
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([pr("PR_1", buckets: [.reviewRequested])]), login: login)
        await inbox.refresh()
        #expect(inbox.findPullRequest(repository: "acme/web", number: 1) != nil)

        inbox.sessionDidChange()
        #expect(inbox.findPullRequest(repository: "acme/web", number: 1) == nil)

        await inbox.refresh()
        #expect(login.calls.count == 2)
        #expect(inbox.snapshot.myLogin == "new-user")
    }

    @Test func showsNothingOfThePreviousAccountWhenTheNewOnesFirstFetchFails() async {
        let fetch = FakeFetch([.success(fetched([pr("PR_1", buckets: [.reviewRequested])])), .failure(TestError("boom"))])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch, login: FakeLogin(["old-user", "new-user"]))
        await inbox.refresh()
        #expect(!inbox.snapshot.items.isEmpty)

        inbox.sessionDidChange()
        #expect(inbox.snapshot == InboxSnapshot.signedOut)

        await inbox.refresh()
        #expect(inbox.snapshot.status == .error)
        #expect(inbox.snapshot.items.isEmpty)
        #expect(inbox.snapshot.myLogin == nil)
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InboxRateLimitTests {
    let defaults = TestDefaults()
    let reset = d("2026-08-10T12:12:00Z")

    @Test func showsAPlainEnglishMessageNamingWhenGitHubsRateLimitLifts() async {
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([.failure(rateLimitError(resetAt: reset))]))

        await inbox.refresh()

        #expect(inbox.snapshot.status == .error)
        #expect(inbox.snapshot.errorMessage == "GitHub's rate limit is reached — try again in 12 minutes")
    }

    @Test func skipsTheRequestWhileTheResetTimeIsStillAheadLeavingTheSnapshotUntouched() async {
        let clock = TestClock(NOW)
        let fetch = FakeFetch([.failure(rateLimitError(resetAt: reset))])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch, clock: clock)

        await inbox.refresh()
        let afterFirstFailure = inbox.snapshot
        var changes: [InboxSnapshot] = []
        inbox.onChange = { changes.append($0) }

        clock.now = d("2026-08-10T12:05:00Z")
        await inbox.refresh()

        #expect(fetch.calls.count == 1)
        #expect(inbox.snapshot == afterFirstFailure)
        #expect(changes.isEmpty)
    }

    @Test func resumesRefreshingAndClearsTheHoldOnceTheResetTimeHasPassed() async {
        let clock = TestClock(NOW)
        let fetch = FakeFetch([
            .failure(rateLimitError(resetAt: reset)),
            .success(fetched([pr("PR_1", buckets: [.reviewRequested])])),
            .success(fetched([])),
        ])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch, clock: clock)

        await inbox.refresh()
        #expect(inbox.snapshot.status == .error)

        clock.now = d("2026-08-10T12:13:00Z")
        await inbox.refresh()

        #expect(fetch.calls.count == 2)
        #expect(inbox.snapshot.status == .ready)
        #expect(inbox.snapshot.errorMessage == nil)

        // Only a clock moved backwards tells "cleared" apart from "timed out".
        clock.now = NOW
        await inbox.refresh()
        #expect(fetch.calls.count == 3)
    }

    @Test func clearsTheHoldOnSignOutSoSigningBackInBeforeTheOriginalResetRefreshesNormally() async {
        let fetch = FakeFetch([.failure(rateLimitError(resetAt: reset)), .success(fetched([]))])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        await inbox.refresh()
        #expect(inbox.snapshot.status == .error)

        inbox.clientProvider = { nil }
        await inbox.refresh()
        #expect(inbox.snapshot.status == .signedOut)

        inbox.clientProvider = { DummyClient() }
        await inbox.refresh()

        #expect(fetch.calls.count == 2)
        #expect(inbox.snapshot.status == .ready)
    }

    @Test func doesNotHoldBackRefreshesForAnOrdinaryErrorThatOnlyLooksLikeA403() async {
        let permission = httpError(403, "Resource not accessible by integration", headers: [
            "x-ratelimit-remaining": "4999",
            "x-ratelimit-reset": "9999999999",
        ])
        let fetch = FakeFetch([.failure(permission)])
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        await inbox.refresh()
        #expect(inbox.snapshot.errorMessage == "Resource not accessible by integration")

        await inbox.refresh()
        #expect(fetch.calls.count == 2)
    }

    @Test func reportsAGatewayErrorAsItsStatusNotAsTheHTMLPageAProxyAnsweredWith() async {
        let badGateway = httpError(502, "<html>\n<head><title>502 Bad Gateway</title></head>\n<body></body>\n</html>")
        let inbox = makeInbox(narrowStore(defaults), fetch: FakeFetch([.failure(badGateway)]))

        await inbox.refresh()

        #expect(inbox.snapshot.errorMessage == "Couldn't reach GitHub — HTTP 502")
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InboxStartStopTests {
    let defaults = TestDefaults()

    // The poll-interval tests ("schedules repeat refreshes", "stop() prevents
    // further ticks") need fake timers; `start` sleeps on the real clock for
    // at least a minute, so only the immediate refreshes are checked here.

    @Test func isLoadingByTheTimeStartReturnsWithAPassToWaitFor() async {
        let fetch = FakeFetch([pr("PR_1", buckets: [.reviewRequested])])
        let held = fetch.hold(1)
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        inbox.start()
        #expect(inbox.snapshot.status == .loading)

        let settled = Box(false)
        let idle = Task {
            await inbox.whenIdle()
            settled.value = true
        }
        await fetch.calls.waitFor(1)
        await settle()
        #expect(settled.value == false)

        held.open()
        await idle.value
        #expect(inbox.snapshot.status == .ready)
        inbox.stop()
    }

    @Test func startsSignedOutAtOnceWithoutAClient() {
        let inbox = makeInbox(narrowStore(defaults))
        inbox.clientProvider = { nil }
        var changes: [InboxSnapshot.Status] = []
        inbox.onChange = { changes.append($0.status) }
        inbox.start()
        #expect(changes == [.signedOut])
        inbox.stop()
    }

    @Test func performsAnImmediateRefresh() async {
        let fetch = FakeFetch()
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        inbox.start()
        await fetch.calls.waitFor(1)
        await inbox.whenIdle()

        #expect(fetch.calls.count == 1)
        inbox.stop()
    }

    @Test func startsWithoutTrappingOnAnAbsurdPollInterval() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.pollIntervalMinutes = Int.max }
        let fetch = FakeFetch()
        let inbox = makeInbox(store, fetch: fetch)

        inbox.start()
        await fetch.calls.waitFor(1)
        await inbox.whenIdle()
        inbox.stop()

        #expect(store.settings.pollIntervalMinutes == Settings.defaults.pollIntervalMinutes)
    }

    @Test func callingStartTwiceRefreshesOncePerCall() async {
        let fetch = FakeFetch()
        let inbox = makeInbox(narrowStore(defaults), fetch: fetch)

        inbox.start()
        await fetch.calls.waitFor(1)
        await inbox.whenIdle()
        inbox.start()
        await fetch.calls.waitFor(2)
        await inbox.whenIdle()

        #expect(fetch.calls.count == 2)
        inbox.stop()
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InboxReclassifyTests {
    let defaults = TestDefaults()

    @Test func movesASnoozedPRToWaitingWithoutRefetching() async {
        let store = narrowStore(defaults)
        let fetch = FakeFetch([pr("PR_1", buckets: [.reviewRequested])])
        let inbox = makeInbox(store, fetch: fetch)
        await inbox.refresh()
        #expect(inbox.snapshot.attentionCount == 1)

        store.snooze("PR_1", type: .untilTime, now: NOW, hours: 2)
        inbox.reclassify()

        #expect(inbox.snapshot.items.first?.category == .waiting)
        #expect(inbox.snapshot.attentionCount == 0)
        #expect(fetch.calls.count == 1)
    }

    private let twoRepos = [
        pr("PR_1", repository: "acme/web", buckets: [.reviewRequested]),
        pr("PR_2", repository: "acme/api", buckets: [.reviewRequested]),
    ]

    @Test func appliesAChangedRepositorySelectionWithoutRefetching() async throws {
        let store = narrowStore(defaults)
        let fetch = FakeFetch(twoRepos)
        let inbox = makeInbox(store, fetch: fetch)
        await inbox.refresh()
        #expect(ids(inbox) == ["PR_1"])

        try store.addRepository("acme/api")
        inbox.reclassify()

        #expect(ids(inbox).sorted() == ["PR_1", "PR_2"])
        #expect(fetch.calls.count == 1)
    }

    @Test func narrowsAwayAPullRequestWhenARepositoryIsRemovedFromTheSelection() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.repositories = ["acme/web", "acme/api"] }
        let fetch = FakeFetch(twoRepos)
        let inbox = makeInbox(store, fetch: fetch)
        await inbox.refresh()
        #expect(ids(inbox).sorted() == ["PR_1", "PR_2"])

        store.removeRepository("acme/api")
        inbox.reclassify()

        #expect(ids(inbox) == ["PR_1"])
        #expect(fetch.calls.count == 1)
    }

    @Test func narrowsAwayAPullRequestWhenWatchAllRepositoriesIsSwitchedOff() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.watchAllRepositories = true }
        let fetch = FakeFetch(twoRepos)
        let inbox = makeInbox(store, fetch: fetch)
        await inbox.refresh()
        #expect(ids(inbox).sorted() == ["PR_1", "PR_2"])

        store.updateSettings { $0.watchAllRepositories = false }
        inbox.reclassify()

        #expect(ids(inbox) == ["PR_1"])
        #expect(fetch.calls.count == 1)
    }

    @Test func keepsStackPositionsAttachedWithoutRefetching() async {
        let store = narrowStore(defaults)
        store.updateSettings { $0.watchAllRepositories = true }
        let fetch = FakeFetch([
            pr("PR_1", buckets: [.reviewRequested]) { $0.headRefName = "part-1"; $0.baseRefName = "main" },
            pr("PR_2", buckets: [.reviewRequested]) { $0.headRefName = "part-2"; $0.baseRefName = "part-1" },
        ])
        let inbox = makeInbox(store, fetch: fetch)
        await inbox.refresh()

        store.snooze("PR_1", type: .untilTime, now: NOW, hours: 2)
        inbox.reclassify()

        let byId = Dictionary(uniqueKeysWithValues: inbox.snapshot.items.map { ($0.pr.id, $0) })
        #expect(byId["PR_1"]?.stack == StackPosition(id: "PR_1", index: 1, total: 2))
        #expect(byId["PR_2"]?.stack == StackPosition(id: "PR_1", index: 2, total: 2))
        #expect(fetch.calls.count == 1)
    }
}
