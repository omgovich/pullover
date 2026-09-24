import Foundation
import os
import PulloverCore

private let log = Logger(subsystem: "Pullover", category: "github")

/// Ids per details request. GitHub terminates any query it spends more than
/// ten seconds on, and the details query asks for up to 2,500 thread comments
/// per pull request, so 25 at a time timed out on a real inbox. The rate limit
/// counts nodes, not requests, so smaller batches cost no meaningful quota.
let detailBatchSize = 10

/// Rounds of "ask again without that org" before giving up on a clean answer.
/// Bounded because the only thing ending the loop is the wording of someone
/// else's error message.
let maxExclusionRounds = 5

public struct FetchedPullRequests: Sendable {
    public var prs: [PullRequest]
    /// Orgs the OAuth app cannot see; their PRs are omitted rather than failing the fetch.
    public var restrictedOrgs: [String]

    public init(prs: [PullRequest], restrictedOrgs: [String] = []) {
        self.prs = prs
        self.restrictedOrgs = restrictedOrgs
    }
}

// MARK: - Response shapes

private struct RateLimitEnvelope: Decodable {
    struct RateLimit: Decodable { var cost: Int; var remaining: Int; var resetAt: String }
    var rateLimit: RateLimit?
}

private struct ViewerData: Decodable {
    struct Viewer: Decodable { var login: String }
    var viewer: Viewer
}

private struct SearchData: Decodable {
    struct Search: Decodable {
        struct Node: Decodable { var id: String? }
        var nodes: [Node?]?
    }
    var search: Search?
}

/// Decodes what it can: one pull request GitHub describes oddly must not take
/// the other nine in its batch down with it.
private struct Lossy<T: Decodable>: Decodable {
    private struct Identified: Decodable { var id: String? }

    var value: T?
    /// Why `value` is nil, and which node it was, for the log.
    var failure: (id: String?, error: any Error)?

    init(from decoder: any Decoder) throws {
        do {
            value = try T(from: decoder)
        } catch {
            failure = ((try? Identified(from: decoder))?.id, error)
        }
    }
}

private struct DetailsData: Decodable {
    var nodes: [Lossy<PullRequestNode>?]?
}

/// The nodes in a search payload, or nil when there is no payload at all. The
/// difference decides whether a failure may be reported as an empty result:
/// "GitHub answered, minus one org" can be; "nothing came back" cannot.
private func searchIds(_ data: Data?) -> [String]? {
    guard let data, let decoded = try? JSONDecoder().decode(SearchData.self, from: data),
          let nodes = decoded.search?.nodes else { return nil }
    return nodes.compactMap { $0?.id }
}

/// Nodes that don't decode are dropped and logged. When every node that came
/// back was dropped, the shape itself has changed, and an empty batch would
/// show as an empty inbox: that throws instead.
private func detailNodes(_ data: Data?) throws -> [PullRequestNode]? {
    guard let data, let decoded = try? ISODate.makeDecoder().decode(DetailsData.self, from: data),
          let nodes = decoded.nodes else { return nil }
    let present = nodes.compactMap { $0 }
    let usable = present.compactMap(\.value)
    for case let (id, error)? in present.map(\.failure) {
        log.error("skipped pull request \(id ?? "(no id)", privacy: .public): \(String(describing: error), privacy: .public)")
    }
    if usable.isEmpty && !present.isEmpty {
        throw GitHubError.malformed("GitHub described every pull request in a shape Pullover can't read")
    }
    return usable
}

// MARK: - Metering

/// Adds up the `rateLimit` of every response in one fetch. Measured rather
/// than derived: GitHub's documented formula assumes every connection returns
/// a full page, which overstates the details query by orders of magnitude.
actor RateMeter {
    var cost = 0
    var lowest: (remaining: Int, resetAt: String)?

    func record(_ data: Data) {
        guard let limit = (try? JSONDecoder().decode(RateLimitEnvelope.self, from: data))?.rateLimit else { return }
        cost += limit.cost
        // The lowest `remaining` rather than the last to arrive: requests run
        // concurrently, so the last response isn't necessarily the last charged.
        if lowest == nil || limit.remaining < lowest!.remaining {
            lowest = (limit.remaining, limit.resetAt)
        }
    }

    func report() {
        guard let lowest else { return }
        log.info("refresh cost \(self.cost) points, \(lowest.remaining) left until \(lowest.resetAt)")
    }
}

struct MeteredClient: GraphQLClient {
    let inner: any GraphQLClient
    let meter: RateMeter

    func execute(_ query: String, variables: [String: JSONValue]) async throws -> Data {
        let data: Data
        do {
            data = try await inner.execute(query, variables: variables)
        } catch {
            // A GraphQL error with partial `data` was still charged for, and
            // carries its `rateLimit` like any other answer.
            if let partial = graphqlPartialData(error) { await meter.record(partial) }
            throw error
        }
        await meter.record(data)
        return data
    }
}

// MARK: - Fetching

public func fetchViewerLogin(_ client: any GraphQLClient) async throws -> String {
    let data = try await client.execute(Queries.viewer, variables: [:])
    do {
        return try JSONDecoder().decode(ViewerData.self, from: data).viewer.login
    } catch {
        throw GitHubError.malformed("GitHub didn't say who is signed in")
    }
}

/// One more attempt at a request that failed on GitHub's side, with no backoff:
/// throttling arrives as a 403 or 429, which the inbox waits out on its own.
/// Never once the fetch is cancelled: a dropped request is then no outage.
private func retryTransient<T: Sendable>(_ attempt: () async throws -> T) async throws -> T {
    do {
        return try await attempt()
    } catch where isTransientError(error) {
        try Task.checkCancellation()
        return try await attempt()
    }
}

/// One locked-down org must not blank the whole inbox: GitHub fails the search
/// and names the org, so ask again excluding it until the search goes through.
///
/// An org is excluded whenever GitHub names a new one, even alongside an
/// unrelated error, since the restriction may be what tripped the rest. Only
/// an answer whose sole complaint is the restriction may stand in for the
/// bucket, though: any other error that survives the exclusion is thrown.
private func searchBucket(_ client: any GraphQLClient, _ bucket: SearchBucket) async throws -> (ids: [String], restrictedOrgs: [String]) {
    var excluded: [String] = []
    var lastError: (any Error)?

    for _ in 0..<maxExclusionRounds {
        do {
            let query = buildSearchQuery(bucket, excludeOrgs: excluded)
            let data = try await retryTransient { try await client.execute(Queries.search, variables: ["q": .string(query)]) }
            // An answer without a result set is broken, not empty. Reporting it
            // as an empty bucket is the one mistake this function exists to avoid.
            guard let ids = searchIds(data) else {
                throw GitHubError.malformed("GitHub answered the search with no result set")
            }
            return (ids, excluded)
        } catch {
            let named = restrictedOrganizations(error)
            guard !named.isEmpty else { throw error }
            lastError = error
            let fresh = named.filter { !excluded.contains($0) }
            if fresh.isEmpty { break }
            excluded += fresh
        }
    }

    // GitHub named the same orgs again or the rounds ran out. Keep whatever came
    // back alongside the last error — but only if the restriction was all that
    // went wrong, and only if something did come back: with no payload there is
    // nothing to stand in for the bucket, and "empty" would be a lie.
    let fallback = GitHubError.malformed("GitHub answered the search with no result set")
    guard let lastError else { throw fallback }
    guard isOnlyRestriction(lastError), let ids = searchIds(graphqlPartialData(lastError)) else { throw lastError }
    return (ids, excluded)
}

/// Asks for these pull requests with one second chance: two half-size requests
/// where there is something to split, a plain repeat where there isn't. A batch
/// that crossed GitHub's ten-second limit will cross it again, so repeating it
/// would only fail more slowly; halves come in comfortably under.
///
/// `maySplit` stops there — dividing all the way down would answer an outage
/// with a couple of hundred requests in flight. What one more ask cannot
/// rescue, the next poll can.
private func fetchDetails(
    _ client: any GraphQLClient,
    _ ids: [String],
    maySplit: Bool = true
) async throws -> (nodes: [PullRequestNode], restrictedOrgs: [String]) {
    do {
        let data = try await client.execute(Queries.details, variables: ["ids": .array(ids.map { .string($0) })])
        guard let nodes = try detailNodes(data) else {
            throw GitHubError.malformed("GitHub answered the details query with no nodes")
        }
        return (nodes, [])
    } catch {
        // A restriction is survivable only while GitHub still hands back the
        // nodes it could resolve; without them this batch is a failure.
        let orgs = restrictedOrganizations(error)
        if !orgs.isEmpty, isOnlyRestriction(error), let salvaged = try? detailNodes(graphqlPartialData(error)) {
            return (salvaged, orgs)
        }
        guard isTransientError(error), maySplit else { throw error }
        try Task.checkCancellation()
        if ids.count == 1 { return try await fetchDetails(client, ids, maySplit: false) }

        let half = (ids.count + 1) / 2
        async let first = fetchDetails(client, Array(ids[..<half]), maySplit: false)
        async let second = fetchDetails(client, Array(ids[half...]), maySplit: false)
        let (a, b) = try await (first, second)
        return (a.nodes + b.nodes, mergeOrgs(a.restrictedOrgs, b.restrictedOrgs))
    }
}

/// PR id → the buckets it turned up in, in a deterministic order: searches run
/// concurrently, but their results are merged in `SearchBucket` order.
private func collectIds(_ client: any GraphQLClient) async throws -> (order: [String], buckets: [String: [SearchBucket]], restrictedOrgs: [String]) {
    let results = try await withThrowingTaskGroup(of: (Int, [String], [String]).self) { group in
        for (index, bucket) in SearchBucket.allCases.enumerated() {
            group.addTask {
                let found = try await searchBucket(client, bucket)
                return (index, found.ids, found.restrictedOrgs)
            }
        }
        var collected: [(Int, [String], [String])] = []
        for try await result in group { collected.append(result) }
        return collected.sorted { $0.0 < $1.0 }
    }

    var order: [String] = []
    var buckets: [String: [SearchBucket]] = [:]
    for (index, ids, _) in results {
        let bucket = SearchBucket.allCases[index]
        for id in ids {
            if buckets[id] == nil { order.append(id) }
            if buckets[id]?.contains(bucket) != true { buckets[id, default: []].append(bucket) }
        }
    }
    return (order, buckets, mergeOrgs(results.map(\.2)))
}

public func fetchPullRequests(_ client: any GraphQLClient, myLogin: String) async throws -> FetchedPullRequests {
    let meter = RateMeter()
    let metered = MeteredClient(inner: client, meter: meter)
    let (order, buckets, searchRestrictions) = try await collectIds(metered)

    let batches = chunk(order, size: detailBatchSize)
    let results = try await withThrowingTaskGroup(of: (Int, [PullRequestNode], [String]).self) { group in
        for (index, ids) in batches.enumerated() {
            group.addTask {
                let result = try await fetchDetails(metered, ids)
                return (index, result.nodes, result.restrictedOrgs)
            }
        }
        var collected: [(Int, [PullRequestNode], [String])] = []
        for try await result in group { collected.append(result) }
        return collected.sorted { $0.0 < $1.0 }
    }

    let prs = results.flatMap(\.1).map { node in
        mapPullRequest(node, buckets: buckets[node.id] ?? [], myLogin: myLogin)
    }
    // Only on the way out: a fetch that threw has no complete number to report.
    await meter.report()

    return FetchedPullRequests(prs: prs, restrictedOrgs: mergeOrgs([searchRestrictions] + results.map(\.2)))
}
