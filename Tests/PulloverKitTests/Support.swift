import Foundation
import PulloverCore
@testable import PulloverKit

// Copied from Tests/PulloverCoreTests/TestFactory.swift: test targets cannot share files.

func d(_ iso: String) -> Date {
    guard let date = ISODate.parse(iso) else { fatalError("Not an ISO 8601 date: \(iso)") }
    return date
}

func makeComment(_ authorLogin: String, _ createdAt: String, _ bodyText: String = "") -> ThreadComment {
    ThreadComment(authorLogin: authorLogin, createdAt: d(createdAt), bodyText: bodyText)
}

func makeReview(_ authorLogin: String, _ submittedAt: String, state: ReviewState = .commented) -> Review {
    Review(authorLogin: authorLogin, state: state, submittedAt: d(submittedAt), bodyText: "")
}

func makeThread(id: String = "thread-1", isResolved: Bool = false, comments: [ThreadComment] = []) -> ReviewThread {
    ReviewThread(id: id, isResolved: isResolved, comments: comments)
}

func makePullRequest(_ configure: (inout PullRequest) -> Void = { _ in }) -> PullRequest {
    var pr = PullRequest(
        id: "PR_1",
        number: 1,
        title: "Add feature",
        url: "https://github.com/acme/web/pull/1",
        repository: "acme/web",
        authorLogin: "alice",
        authorAvatarURL: "https://avatars.example/alice.png",
        createdAt: d("2026-08-01T10:00:00Z"),
        updatedAt: d("2026-08-01T10:00:00Z"),
        isDraft: false,
        additions: 10,
        deletions: 2,
        headRefName: "feature-1",
        baseRefName: "main",
        ciStatus: .success,
        lastCommitPushedAt: d("2026-08-01T10:00:00Z"),
        reviewDecision: .reviewRequired,
        mergeable: .mergeable,
        hasAutoMerge: false,
        reviews: [],
        reviewThreads: [],
        conversationComments: [],
        reviewRequestedAt: nil,
        readyForReviewAt: nil,
        mentionsAt: [],
        buckets: []
    )
    configure(&pr)
    return pr
}

/// A pull request with the fields most tests vary, the rest defaulted.
func pr(
    _ id: String,
    repository: String = "acme/web",
    number: Int = 1,
    buckets: [SearchBucket] = [],
    _ configure: (inout PullRequest) -> Void = { _ in }
) -> PullRequest {
    makePullRequest {
        $0.id = id
        $0.repository = repository
        $0.number = number
        $0.buckets = buckets
        configure(&$0)
    }
}

func fetched(_ prs: [PullRequest]) -> FetchedPullRequests {
    FetchedPullRequests(prs: prs, restrictedOrgs: [])
}

// MARK: - Stores

/// A throwaway `UserDefaults` domain, removed from disk when the test is done with it.
final class TestDefaults: @unchecked Sendable {
    let name = "PulloverKitTests.\(UUID().uuidString)"
    let defaults: UserDefaults

    init() { defaults = UserDefaults(suiteName: name)! }

    deinit { defaults.removePersistentDomain(forName: name) }

    func makeStore() -> AppStore { AppStore(defaults: defaults) }

    func writeSettings(_ json: String) {
        defaults.set(Data(json.utf8), forKey: "settings")
    }
}

// MARK: - Synchronisation

/// Holds callers until opened. Once open, stays open.
final class Gate: @unchecked Sendable {
    private let lock = NSLock()
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let resumeNow = lock.withLock {
                if isOpen { return true }
                waiters.append(continuation)
                return false
            }
            if resumeNow { continuation.resume() }
        }
    }

    func open() {
        let pending = lock.withLock {
            isOpen = true
            defer { waiters = [] }
            return waiters
        }
        pending.forEach { $0.resume() }
    }
}

/// Counts calls, and lets a test wait until a number of them have arrived.
final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    private var waiters: [(target: Int, continuation: CheckedContinuation<Void, Never>)] = []

    var count: Int { lock.withLock { value } }

    /// Returns the new count: 1 for the first call.
    @discardableResult
    func increment() -> Int {
        let (count, ready) = lock.withLock {
            value += 1
            let ready = waiters.filter { $0.target <= value }
            waiters.removeAll { $0.target <= value }
            return (value, ready)
        }
        ready.forEach { $0.continuation.resume() }
        return count
    }

    func reset() { lock.withLock { value = 0 } }

    func waitFor(_ target: Int) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let resumeNow = lock.withLock {
                if value >= target { return true }
                waiters.append((target, continuation))
                return false
            }
            if resumeNow { continuation.resume() }
        }
    }
}

/// A value shared between a test and the closures it hands out.
final class Box<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: T

    init(_ value: T) { stored = value }

    var value: T {
        get { lock.withLock { stored } }
        set { lock.withLock { stored = newValue } }
    }
}

/// A clock that answers from a queue of readings first, then a fixed value.
final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var queue: [Date]
    private var current: Date

    init(_ now: Date, then queue: [Date] = []) {
        current = now
        self.queue = queue
    }

    var now: Date {
        get { lock.withLock { queue.isEmpty ? current : queue.removeFirst() } }
        set { lock.withLock { current = newValue } }
    }
}

/// Lets the main actor run everything already queued on it.
@MainActor
func settle() async {
    for _ in 0..<20 { await Task.yield() }
}

struct TestError: LocalizedError, Equatable {
    var message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

// MARK: - GraphQL

struct DummyClient: GraphQLClient {
    func execute(_ query: String, variables: [String: JSONValue]) async throws -> Data {
        throw TestError("DummyClient is never called")
    }
}

enum QueryKind: Equatable, Sendable {
    case viewer, search, details
}

func kind(of query: String) -> QueryKind {
    if query.contains("SearchPullRequests") { return .search }
    if query.contains("PullRequestDetails") { return .details }
    if query.contains("Viewer") { return .viewer }
    fatalError("unexpected query: \(query)")
}

struct GraphQLCall: Sendable {
    var kind: QueryKind
    var variables: [String: JSONValue]

    var q: String { variables["q"]?.stringValue ?? "" }
    var ids: [String] {
        guard case let .array(values)? = variables["ids"] else { return [] }
        return values.compactMap(\.stringValue)
    }
}

/// A client answering from a closure, recording every call it gets.
final class FakeGraphQLClient: GraphQLClient, @unchecked Sendable {
    typealias Answer = @Sendable (GraphQLCall) async throws -> JSONValue

    private let lock = NSLock()
    private var recorded: [GraphQLCall] = []
    private let answer: Answer

    init(_ answer: @escaping Answer) { self.answer = answer }

    var calls: [GraphQLCall] { lock.withLock { recorded } }
    func calls(_ kind: QueryKind) -> [GraphQLCall] { calls.filter { $0.kind == kind } }

    func execute(_ query: String, variables: [String: JSONValue]) async throws -> Data {
        let call = GraphQLCall(kind: kind(of: query), variables: variables)
        lock.withLock { recorded.append(call) }
        return try encode(await answer(call))
    }
}

/// Sorted keys, so encoding the same value twice gives the same bytes — errors
/// carrying encoded data compare equal only then.
func encode(_ value: JSONValue) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    return try encoder.encode(value)
}

func decodeJSON(_ data: Data?) -> JSONValue? {
    data.flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) }
}

func searchResult(_ ids: [String]) -> JSONValue {
    ["search": ["nodes": .array(ids.map { ["id": .string($0)] })]]
}

func detailNode(_ id: String, _ overrides: [String: JSONValue] = [:]) -> JSONValue {
    let base: [String: JSONValue] = [
        "id": .string(id),
        "number": 7,
        "title": "Add feature",
        "url": "https://github.com/acme/web/pull/7",
        "isDraft": false,
        "createdAt": "2026-08-01T10:00:00Z",
        "updatedAt": "2026-08-02T10:00:00Z",
        "additions": 1,
        "deletions": 0,
        "headRefName": "feature",
        "baseRefName": "main",
        "reviewDecision": "REVIEW_REQUIRED",
        "mergeable": "MERGEABLE",
        "autoMergeRequest": nil,
        "author": ["login": "alice", "avatarUrl": "https://avatars.example/alice.png"],
        "repository": ["nameWithOwner": "acme/web"],
        "reviews": ["nodes": []],
        "reviewThreads": ["nodes": []],
        "comments": ["nodes": []],
        "bodyText": "",
        "commits": ["nodes": []],
        "timelineItems": ["nodes": []],
    ]
    return .object(base.merging(overrides) { _, new in new })
}

func detailsResult(_ nodes: [JSONValue]) -> JSONValue {
    ["nodes": .array(nodes)]
}

/// Answers searches from `idsByQualifier` and details from `nodes`.
func fakeClient(_ idsByQualifier: [String: [String]], _ nodes: [JSONValue]) -> FakeGraphQLClient {
    FakeGraphQLClient { call in
        switch call.kind {
        case .viewer:
            return ["viewer": ["login": "vlad"]]
        case .search:
            let ids = idsByQualifier.first { call.q.contains($0.key) }?.value ?? []
            return searchResult(ids)
        case .details:
            let wanted = call.ids
            return detailsResult(nodes.filter { wanted.contains($0["id"]?.stringValue ?? "") })
        }
    }
}

func restrictionMessage(_ org: String) -> String {
    "Although you appear to have the correct authorization credentials, the `\(org)` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited."
}

func graphqlError(_ messages: [String], data: JSONValue?) -> GitHubError {
    .graphql(messages: messages, partialData: data.map { try! encode($0) })
}

func httpError(_ status: Int, _ message: String? = nil, headers: [String: String] = [:]) -> GitHubError {
    .http(status: status, message: message ?? "HTTP \(status)", headers: headers)
}

// MARK: - JSON navigation

extension JSONValue {
    var arrayValue: [JSONValue]? {
        if case let .array(a) = self { return a }
        return nil
    }

    var isNull: Bool { self == .null }
}
