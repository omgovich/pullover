import Foundation
import Observation
import PulloverCore

/// Fetches, classifies and holds the inbox. Everything the window, the status
/// item and the MCP server show is read from `snapshot`.
@MainActor
@Observable
public final class Inbox {
    public typealias FetchPRs = @Sendable (any GraphQLClient, String) async throws -> FetchedPullRequests
    public typealias FetchLogin = @Sendable (any GraphQLClient) async throws -> String

    public private(set) var snapshot = InboxSnapshot.signedOut

    /// Returns nil while the user is signed out.
    @ObservationIgnored public var clientProvider: () -> (any GraphQLClient)?
    /// Called when a refresh fails with a dead token rather than a network
    /// blip. The inbox never touches token storage itself, so it hands the
    /// decision of what "sign out" means back to its owner.
    @ObservationIgnored public var onAuthError: (() -> Void)?
    @ObservationIgnored public var onChange: ((InboxSnapshot) -> Void)?

    @ObservationIgnored private let store: AppStore
    @ObservationIgnored private let now: @Sendable () -> Date
    @ObservationIgnored private let fetchPRs: FetchPRs
    @ObservationIgnored private let fetchLogin: FetchLogin

    /// The unfiltered fetch: the repository filter is applied at classify time,
    /// so ticking a checkbox updates the list without a refetch.
    @ObservationIgnored private var prs: [PullRequest] = []
    @ObservationIgnored private var myLogin: String?
    @ObservationIgnored private var inFlight: Task<Void, Never>?
    /// At most one extra pass, shared by everyone who asked while one was running.
    @ObservationIgnored private var queued: Task<Void, Never>?
    /// Numbers passes, so one only clears `inFlight` while it is still the current one.
    @ObservationIgnored private var passCount = 0
    /// When a hit rate limit lifts. Refreshes are skipped until then.
    @ObservationIgnored private var rateLimitedUntil: Date?
    @ObservationIgnored private var poller: Task<Void, Never>?
    /// Bumped whenever the credentials change. A pass applies its result, its
    /// error or `onAuthError` only while this still matches the value it
    /// started with, so a pass begun under one account never touches the next.
    @ObservationIgnored private var session = 0

    public init(
        store: AppStore,
        clientProvider: @escaping () -> (any GraphQLClient)? = { nil },
        now: @escaping @Sendable () -> Date = { Date() },
        fetchPRs: @escaping FetchPRs = { try await fetchPullRequests($0, myLogin: $1) },
        fetchLogin: @escaping FetchLogin = { try await fetchViewerLogin($0) }
    ) {
        self.store = store
        self.clientProvider = clientProvider
        self.now = now
        self.fetchPRs = fetchPRs
        self.fetchLogin = fetchLogin
    }

    private func emit(_ change: (inout InboxSnapshot) -> Void) {
        var next = snapshot
        change(&next)
        snapshot = next
        onChange?(next)
    }

    private var repositoryFilter: [String]? {
        let settings = store.settings
        return settings.watchAllRepositories ? nil : settings.repositories
    }

    /// Stack positions come from the unfiltered fetch, so a stack stays whole
    /// even when the repository filter hides part of it.
    private func attachStacks(_ items: [ClassifiedPullRequest]) -> [ClassifiedPullRequest] {
        let stacks = computeStackPositions(prs)
        return items.map { item in
            var item = item
            item.stack = stacks[item.pr.id]
            return item
        }
    }

    private func classified(myLogin: String, at now: Date) -> [ClassifiedPullRequest] {
        let context = ClassifyContext(myLogin: myLogin, snoozes: store.snoozes, now: now)
        return attachStacks(classifyAll(filterByRepositories(prs, repositoryFilter), context: context))
    }

    /// Re-runs the classifier over pull requests already in memory. No network.
    public func reclassify() {
        guard let myLogin else { return }
        let items = classified(myLogin: myLogin, at: now())
        emit {
            $0.items = items
            $0.attentionCount = countAttention(items)
        }
    }

    /// Looks in the unfiltered fetch, not the snapshot: a caller naming a pull
    /// request by number should get an answer even when the filter or the
    /// classifier keeps it out of the window.
    public func findPullRequest(repository: String, number: Int) -> ClassifiedPullRequest? {
        guard let myLogin else { return nil }
        let wanted = repository.lowercased()
        guard let pr = prs.first(where: { $0.number == number && $0.repository.lowercased() == wanted }) else {
            return nil
        }
        let context = ClassifyContext(myLogin: myLogin, snoozes: store.snoozes, now: now())
        return attachStacks([classify(pr, context: context)]).first
    }

    /// Runs exactly one pass at a time. A caller arriving mid-pass does not join
    /// it — that pass may already have read state that predates the caller's
    /// change — but is queued behind one follow-up pass shared by everyone who
    /// arrived before it started. So when this returns, a pass that began
    /// after the call has finished.
    public func refresh() async {
        await requestPass().value
    }

    /// Returns when the pass running now, and any queued behind it, have finished.
    public func whenIdle() async {
        await (queued ?? inFlight)?.value
    }

    /// The owner calls this whenever the credentials change — sign-out, or a
    /// sign-in as whoever. It forgets the previous account's identity and list
    /// and disowns any pass still in flight, so a late result or a stale 401
    /// from the old token cannot land on the new account.
    public func sessionDidChange() {
        session += 1
        myLogin = nil
        prs = []
        rateLimitedUntil = nil
        // The list on screen belongs to the old credentials too: if the new
        // session's first fetch fails, it must not be left showing — or served
        // to an agent — under the new one.
        emit { $0 = .signedOut }
    }

    /// Starts a pass, or queues the one follow-up, without waiting for it.
    /// Synchronous, so the snapshot says `loading` by the time it returns.
    /// Internal rather than private so tests can make a request at an exact moment.
    @discardableResult
    func requestPass() -> Task<Void, Never> {
        // Not started yet, so it begins after this call: joining it is enough.
        // Checked before `inFlight`, which is already nil in the moment between
        // the pass ahead finishing and this one starting.
        if let queued { return queued }
        if let inFlight {
            let followUp = Task {
                await inFlight.value
                self.queued = nil
                await self.startPass().value
            }
            queued = followUp
            return followUp
        }
        return startPass()
    }

    private func startPass() -> Task<Void, Never> {
        passCount += 1
        let id = passCount
        let client = beginPass()
        let session = self.session
        let pass = Task {
            if let client { await self.fetchAndApply(client, session: session) }
            // A later pass may have taken over the slot; that one clears its own.
            if self.passCount == id { self.inFlight = nil }
        }
        inFlight = pass
        return pass
    }

    /// The synchronous start of a pass: the client to fetch with, or nil when
    /// there is nothing to fetch.
    private func beginPass() -> (any GraphQLClient)? {
        guard let client = clientProvider() else {
            // Signed out: drop the identity and the list, so a sign-in as a
            // different account starts clean.
            myLogin = nil
            prs = []
            rateLimitedUntil = nil
            emit { $0 = .signedOut }
            return nil
        }

        // Before the `loading` emit, or a manual refresh would strand the
        // interface in a spinner. The message already says why nothing happens.
        if let until = rateLimitedUntil, until > now() { return nil }

        emit {
            $0.status = .loading
            $0.errorMessage = nil
        }
        return client
    }

    private func fetchAndApply(_ client: any GraphQLClient, session: Int) async {
        // The credentials changed while this pass was waiting on the network:
        // its result, or its error, belongs to an account that is gone.
        var isCurrent: Bool { session == self.session && clientProvider() != nil }
        do {
            let login: String
            if let myLogin {
                login = myLogin
            } else {
                login = try await fetchLogin(client)
                guard isCurrent else { return }
                myLogin = login
            }
            let fetched = try await fetchPRs(client, login)
            guard isCurrent else { return }
            prs = fetched.prs

            let fetchedAt = now()
            let items = classified(myLogin: login, at: fetchedAt)
            rateLimitedUntil = nil
            emit {
                $0.status = .ready
                $0.items = items
                $0.attentionCount = countAttention(items)
                $0.lastUpdatedAt = fetchedAt
                $0.errorMessage = formatRestrictedOrgs(fetched.restrictedOrgs)
                $0.myLogin = login
                $0.knownRepositories = collectRepositories(fetched.prs)
            }
        } catch {
            guard isCurrent else { return }
            let resetAt = rateLimitResetAt(error, now: now())
            rateLimitedUntil = resetAt
            // Keep the last good list on screen; the header shows its age.
            let message = resetAt.map { "GitHub's rate limit is reached — try again in \(formatWait(until: $0, now: now()))" }
                ?? describeError(error)
            emit {
                $0.status = .error
                $0.errorMessage = message
            }
            // A dead token fails every refresh the same way forever.
            if isAuthError(error) { onAuthError?() }
        }
    }

    /// Refreshes now and then every poll interval, until `stop`.
    /// The first pass begins before this returns, so the snapshot already says
    /// `loading` and `whenIdle` has a pass to wait for.
    public func start() {
        stop()
        requestPass()
        // Settings decoding already bounds this; clamp anyway so no value can overflow.
        let minutes = min(max(1, store.settings.pollIntervalMinutes), Settings.pollIntervalRange.upperBound)
        let interval = Duration.seconds(minutes * 60)
        poller = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                if Task.isCancelled { break }
                await self?.refresh()
            }
        }
    }

    public func stop() {
        poller?.cancel()
        poller = nil
    }
}
