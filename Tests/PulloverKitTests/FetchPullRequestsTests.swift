import Foundation
import PulloverCore
import Testing
@testable import PulloverKit

@Suite struct FetchViewerLoginTests {
    @Test func returnsTheAuthenticatedLogin() async throws {
        #expect(try await fetchViewerLogin(fakeClient([:], [])) == "vlad")
    }

    @Test func failsWhenGitHubDoesNotSayWhoIsSignedIn() async {
        let client = FakeGraphQLClient { _ in ["viewer": nil] }
        await #expect(throws: GitHubError.malformed("GitHub didn't say who is signed in")) {
            try await fetchViewerLogin(client)
        }
    }
}

@Suite(.timeLimit(.minutes(1)))
struct FetchPullRequestsTests {
    @Test func issuesOneUnscopedSearchQueryPerBucketAndReturnsPullRequests() async throws {
        let client = fakeClient(["review-requested:@me": ["PR_1"]], [detailNode("PR_1")])
        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.map(\.id) == ["PR_1"])
        let searches = client.calls(.search)
        #expect(searches.count == 4)
        for search in searches { #expect(!search.q.contains("repo:")) }
    }

    @Test func recordsWhichBucketsAPRCameFrom() async throws {
        let client = fakeClient(["review-requested:@me": ["PR_1"], "mentions:@me": ["PR_1"]], [detailNode("PR_1")])
        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.count == 1)
        #expect(Set(result.prs[0].buckets) == [.mentions, .reviewRequested])
    }

    @Test func fetchesDetailsOnceForAPRFoundInSeveralBuckets() async throws {
        let client = fakeClient(
            ["review-requested:@me": ["PR_1"], "involves:@me": ["PR_1"], "mentions:@me": ["PR_1"]],
            [detailNode("PR_1")]
        )
        _ = try await fetchPullRequests(client, myLogin: "vlad")
        let details = client.calls(.details)
        #expect(details.count == 1)
        #expect(details.first?.ids == ["PR_1"])
    }

    @Test func splitsDetailRequestsIntoBatchesOfDetailBatchSizeIds() async throws {
        let ids = (0..<60).map { "PR_\($0)" }
        let client = fakeClient(["author:@me": ids], ids.map { detailNode($0) })

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        let batches = client.calls(.details).map(\.ids)
        #expect(batches.count == 6)
        for batch in batches { #expect(batch.count <= detailBatchSize) }
        #expect(batches.flatMap { $0 }.sorted() == ids.sorted())
        #expect(result.prs.map(\.id).sorted() == ids.sorted())
    }

    @Test func asksASecondTimeForASearchThatGitHubFailedToAnswer() async throws {
        let inner = fakeClient(["author:@me": ["PR_1"]], [detailNode("PR_1")])
        let attempts = Counter()
        let client = FakeGraphQLClient { call in
            if call.kind == .search, attempts.increment() == 1 { throw httpError(502) }
            return try await answer(inner, call)
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(result.prs.map(\.id) == ["PR_1"])
        #expect(client.calls(.search).count == 5)
    }

    @Test func splitsAFailedDetailBatchInHalfRatherThanAskingForTheSameIdsAgain() async throws {
        let ids = (0..<10).map { "PR_\($0)" }
        let inner = fakeClient(["author:@me": ids], ids.map { detailNode($0) })
        let client = FakeGraphQLClient { call in
            if call.kind == .details, call.ids.count == 10 { throw httpError(502) }
            return try await answer(inner, call)
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(result.prs.map(\.id) == ids)
        let asked = client.calls(.details).map(\.ids)
        #expect(asked.count == 3)
        #expect(asked.first == ids)
        // The halves go out concurrently, in either order.
        #expect(Set(asked.dropFirst()) == [Array(ids[..<5]), Array(ids[5...])])
    }

    @Test func asksASecondTimeForALoneIdWhichCannotHaveBeenTheSizeThatBroke() async throws {
        let inner = fakeClient(["author:@me": ["PR_1"]], [detailNode("PR_1")])
        let attempts = Counter()
        let client = FakeGraphQLClient { call in
            if call.kind == .details, attempts.increment() == 1 { throw httpError(502) }
            return try await answer(inner, call)
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(result.prs.map(\.id) == ["PR_1"])
        #expect(client.calls(.details).count == 2)
    }

    @Test func givesUpAfterOneSplitRatherThanDividingAllTheWayDown() async {
        let ids = ["PR_0", "PR_1", "PR_2"]
        let client = FakeGraphQLClient { call in
            if call.kind == .search { return searchResult(call.q.contains("author:@me") ? ids : []) }
            throw httpError(502)
        }

        await #expect(throws: httpError(502)) { try await fetchPullRequests(client, myLogin: "vlad") }

        let asked = client.calls(.details).map(\.ids)
        #expect(asked.count == 3)
        #expect(asked.first == ids)
        #expect(Set(asked.dropFirst()) == [["PR_0", "PR_1"], ["PR_2"]])
    }

    @Test(arguments: [401, 403, 429])
    func neverAsksAgainForARateLimitOrADeadToken(status: Int) async {
        let client = FakeGraphQLClient { _ in throw httpError(status) }

        await #expect(throws: httpError(status)) { try await fetchPullRequests(client, myLogin: "vlad") }

        // One attempt per bucket: the inbox decides what a rate limit means.
        #expect(client.calls.count == 4)
    }

    // The three rate-meter tests ("adds up the rate-limit cost", "reports the
    // lowest remaining", "says nothing when ... no rate limit") assert on
    // console output; the Swift meter logs to os.Logger, which has no hook.

    @Test func mapsTheDetailNodeIntoADomainPullRequest() async throws {
        let client = fakeClient(["author:@me": ["PR_1"]], [detailNode("PR_1")])
        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.first?.repository == "acme/web")
        #expect(result.prs.first?.authorLogin == "alice")
    }

    @Test func skipsIdsTheDetailsQueryCouldNotResolve() async throws {
        let client = fakeClient(["author:@me": ["PR_1", "PR_missing"]], [detailNode("PR_1")])
        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.map(\.id) == ["PR_1"])
    }

    @Test func skipsANullNodeGitHubReturnsInPlaceOfAnUnresolvedId() async throws {
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .viewer: return ["viewer": ["login": "vlad"]]
            case .search: return searchResult(["PR_1", "PR_missing"])
            case .details: return detailsResult([detailNode("PR_1"), .null])
            }
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(client.calls(.details).map(\.ids) == [["PR_1", "PR_missing"]])
        #expect(result.prs.map(\.id) == ["PR_1"])
    }

    @Test func skipsANodeItCannotDecodeWithoutLosingTheRestOfTheBatch() async throws {
        let client = fakeClient(["author:@me": ["PR_1", "PR_2"]], [detailNode("PR_1"), detailNode("PR_2", ["createdAt": 42])])
        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.map(\.id) == ["PR_1"])
    }

    @Test func failsWhenNotOneNodeInABatchCanBeDecoded() async {
        // A schema change, not one odd pull request: an empty batch would read as an empty inbox.
        let client = fakeClient(
            ["author:@me": ["PR_1", "PR_2"]],
            [detailNode("PR_1", ["createdAt": 42]), detailNode("PR_2", ["mergeable": nil])]
        )
        await #expect(throws: GitHubError.malformed("GitHub described every pull request in a shape Pullover can't read")) {
            try await fetchPullRequests(client, myLogin: "vlad")
        }
        // Not retried: asking again would get the same shape.
        #expect(client.calls(.details).count == 1)
    }

    @Test func acceptsABatchOfOnlyNullNodes() async throws {
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .viewer: return ["viewer": ["login": "vlad"]]
            case .search: return searchResult(["PR_gone"])
            case .details: return detailsResult([.null])
            }
        }
        #expect(try await fetchPullRequests(client, myLogin: "vlad").prs.isEmpty)
    }

    @Test func passesMyLoginThroughToMapPullRequestSoMentionsOfThatLoginAreDetected() async throws {
        let client = fakeClient(["mentions:@me": ["PR_1"]], [detailNode("PR_1", ["bodyText": "Hey @vlad, take a look"])])
        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.first?.mentionsAt.isEmpty == false)
    }

    @Test func issuesAllFourBucketSearchesConcurrently() async throws {
        let entered = Counter()
        let release = Gate()
        let client = FakeGraphQLClient { call in
            guard call.kind == .search else { throw TestError("unexpected query") }
            entered.increment()
            await release.wait()
            return searchResult([])
        }

        let result = Task { try await fetchPullRequests(client, myLogin: "vlad") }
        // A sequential implementation never gets past one, and the time limit fails it.
        await entered.waitFor(4)
        #expect(client.calls(.search).count == 4)

        release.open()
        let fetched = try await result.value
        #expect(fetched.prs.isEmpty)
        #expect(fetched.restrictedOrgs.isEmpty)
    }

    @Test func issuesDetailBatchesConcurrently() async throws {
        let ids = (0..<60).map { "PR_\($0)" }
        let entered = Counter()
        let release = Gate()
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .viewer: return ["viewer": ["login": "vlad"]]
            case .search: return searchResult(ids)
            case .details:
                entered.increment()
                await release.wait()
                return detailsResult([])
            }
        }

        let result = Task { try await fetchPullRequests(client, myLogin: "vlad") }
        await entered.waitFor(6)
        #expect(client.calls(.details).count == 6)

        release.open()
        let fetched = try await result.value
        #expect(fetched.prs.isEmpty)
        #expect(fetched.restrictedOrgs.isEmpty)
    }

    @Test func rebuildsTheResultInTheOrderIdsWereCollectedNotTheOrderDetailBatchesResolve() async throws {
        let batchA = (0..<detailBatchSize).map { "A_\($0)" }
        let batchB = (0..<5).map { "B_\($0)" }
        let allIds = batchA + batchB
        let entered = Counter()
        let releaseA = Gate()
        let releaseB = Gate()
        let bDone = Gate()
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .viewer: return ["viewer": ["login": "vlad"]]
            case .search: return searchResult(allIds)
            case .details:
                entered.increment()
                if call.ids.first == "A_0" {
                    await releaseA.wait()
                    return detailsResult(batchA.map { detailNode($0) })
                }
                await releaseB.wait()
                defer { bDone.open() }
                return detailsResult(batchB.map { detailNode($0) })
            }
        }

        let result = Task { try await fetchPullRequests(client, myLogin: "vlad") }
        await entered.waitFor(2)

        releaseB.open()
        await bDone.wait()
        releaseA.open()

        #expect(try await result.value.prs.map(\.id) == allIds)
    }

    @Test func retriesTheSearchExcludingAnOrgThatBlocksTheOAuthApp() async throws {
        let restriction = graphqlError([restrictionMessage("status-im")], data: nil)
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .search:
                if !call.q.contains("-org:status-im") { throw restriction }
                return searchResult(["PR_1"])
            case .details: return detailsResult([detailNode("PR_1")])
            case .viewer: throw TestError("unexpected query")
            }
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.map(\.id) == ["PR_1"])
        #expect(result.restrictedOrgs == ["status-im"])
    }

    @Test func failsRatherThanReportingAnEmptyBucketWhenTheRestrictionCarriesNoResults() async {
        // A plain 403 names the org but brings no payload to stand in for the bucket.
        let forbidden = httpError(403, restrictionMessage("status-im"))
        let client = FakeGraphQLClient { call in
            if call.kind == .search { throw forbidden }
            throw TestError("unexpected query")
        }

        await #expect(throws: forbidden) { try await fetchPullRequests(client, myLogin: "vlad") }
    }

    @Test func failsWhenSomethingElseWentWrongInTheSameResponseAsTheRestriction() async {
        let mixed = graphqlError(
            [
                "the `status-im` organization has enabled OAuth App access restrictions",
                "Something went wrong while executing your query.",
            ],
            data: searchResult(["PR_1"])
        )
        let client = FakeGraphQLClient { call in
            if call.kind == .search { throw mixed }
            throw TestError("unexpected query")
        }

        let error = await #expect(throws: GitHubError.self) { try await fetchPullRequests(client, myLogin: "vlad") }
        #expect(error.map(describeError)?.contains("Something went wrong") == true)
    }

    @Test func excludesARestrictedOrgNamedAlongsideAnUnrelatedErrorAndKeepsTheRetrysAnswer() async throws {
        let mixed = graphqlError(
            [restrictionMessage("status-im"), "Something went wrong while executing your query."],
            data: nil
        )
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .search:
                if !call.q.contains("-org:status-im") { throw mixed }
                return searchResult(call.q.contains("author:@me") ? ["PR_1"] : [])
            case .details: return detailsResult([detailNode("PR_1")])
            case .viewer: throw TestError("unexpected query")
            }
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(result.prs.map(\.id) == ["PR_1"])
        #expect(result.restrictedOrgs == ["status-im"])
        #expect(client.calls(.search).count == 8)
    }

    @Test func surfacesAnUnrelatedErrorThatOutlivesTheExclusion() async {
        let mixed = graphqlError(
            [restrictionMessage("status-im"), "Something went wrong while executing your query."],
            data: searchResult(["PR_1"])
        )
        let unrelated = graphqlError(["Something went wrong while executing your query."], data: searchResult(["PR_1"]))
        let client = FakeGraphQLClient { call in
            if call.kind == .search { throw call.q.contains("-org:status-im") ? unrelated : mixed }
            throw TestError("unexpected query")
        }

        await #expect(throws: unrelated) { try await fetchPullRequests(client, myLogin: "vlad") }
        // Every bucket did ask again without the org before giving up.
        #expect(client.calls(.search).contains { $0.q.contains("-org:status-im") })
    }

    @Test func doesNotRetryASearchOnceTheFetchIsCancelled() async {
        let client = FakeGraphQLClient { call in
            guard call.kind == .search else { throw TestError("unexpected query") }
            // The network error a cancelled request can surface as, arriving
            // after the fetch was cancelled.
            withUnsafeCurrentTask { $0?.cancel() }
            throw GitHubError.network("cancelled")
        }

        await #expect(throws: CancellationError.self) { try await fetchPullRequests(client, myLogin: "vlad") }
        #expect(client.calls(.search).count == 4)
    }

    @Test func doesNotRetryOrSplitADetailBatchOnceTheFetchIsCancelled() async {
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .search: return searchResult(call.q.contains("author:@me") ? ["PR_1", "PR_2"] : [])
            case .details:
                withUnsafeCurrentTask { $0?.cancel() }
                throw httpError(502)
            case .viewer: throw TestError("unexpected query")
            }
        }

        await #expect(throws: CancellationError.self) { try await fetchPullRequests(client, myLogin: "vlad") }
        #expect(client.calls(.details).count == 1)
    }

    @Test func stopsAskingOnceGitHubNamesTheSameOrgTwiceKeepingWhatItReturned() async throws {
        let stuck = graphqlError(
            ["the `status-im` organization has enabled OAuth App access restrictions"],
            data: searchResult(["PR_1"])
        )
        let searches = Counter()
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .search:
                searches.increment()
                throw stuck
            case .details: return detailsResult([detailNode("PR_1")])
            case .viewer: throw TestError("unexpected query")
            }
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(result.prs.map(\.id) == ["PR_1"])
        #expect(result.restrictedOrgs == ["status-im"])
        // Four buckets, two attempts each: the first, then one with the exclusion.
        #expect(searches.count == 8)
    }

    @Test func keepsTheResultsItHasWhenTheRoundsOfExclusionRunOut() async throws {
        let round = Counter()
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .search:
                let n = round.increment()
                throw graphqlError(
                    ["the `org-\(n)` organization has enabled OAuth App access restrictions"],
                    data: searchResult(["PR_1"])
                )
            case .details: return detailsResult([detailNode("PR_1")])
            case .viewer: throw TestError("unexpected query")
            }
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(result.prs.map(\.id) == ["PR_1"])
        #expect(!result.restrictedOrgs.isEmpty)
        #expect(round.count == 4 * maxExclusionRounds)
    }

    @Test func recoversARestrictionThatOnlyShowsUpOnADetailBatchSecondTry() async throws {
        // Eleven ids split into ten and one. The singleton fails transiently, and
        // its retry is the request that hits the restriction.
        let ids = (1...11).map { "PR_\($0)" }
        let restriction = graphqlError(
            ["the `status-im` organization has enabled OAuth App access restrictions"],
            data: detailsResult([.null])
        )
        let singletonAttempts = Counter()
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .search: return searchResult(ids)
            case .details:
                if call.ids.count > 1 { return detailsResult(call.ids.map { detailNode($0) }) }
                if singletonAttempts.increment() == 1 { throw httpError(502, "bad gateway") }
                throw restriction
            case .viewer: throw TestError("unexpected query")
            }
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")

        #expect(result.prs.map(\.id) == Array(ids.prefix(10)))
        #expect(result.restrictedOrgs == ["status-im"])
    }

    @Test func failsLoudlyWhenASearchSucceedsWithoutAResultSet() async {
        let client = FakeGraphQLClient { call in
            if call.kind == .search { return ["search": nil] }
            throw TestError("unexpected query")
        }

        await #expect(throws: GitHubError.malformed("GitHub answered the search with no result set")) {
            try await fetchPullRequests(client, myLogin: "vlad")
        }
    }

    @Test func keepsOtherPRsWhenADetailBatchNamesARestrictedOrg() async throws {
        let restriction = graphqlError([restrictionMessage("status-im")], data: detailsResult([detailNode("PR_1"), .null]))
        let client = FakeGraphQLClient { call in
            switch call.kind {
            case .search: return searchResult(["PR_1", "PR_blocked"])
            case .details: throw restriction
            case .viewer: throw TestError("unexpected query")
            }
        }

        let result = try await fetchPullRequests(client, myLogin: "vlad")
        #expect(result.prs.map(\.id) == ["PR_1"])
        #expect(result.restrictedOrgs == ["status-im"])
    }
}

@Suite struct MeteredClientTests {
    @Test func countsTheCostOfAnErrorResponseThatStillCarriedData() async {
        let meter = RateMeter()
        let partial: JSONValue = [
            "rateLimit": ["cost": 3, "remaining": 4200, "resetAt": "2026-08-10T13:00:00Z"],
            "search": ["nodes": []],
        ]
        let inner = FakeGraphQLClient { _ in throw graphqlError(["Something went wrong"], data: partial) }
        let client = MeteredClient(inner: inner, meter: meter)

        await #expect(throws: graphqlError(["Something went wrong"], data: partial)) {
            try await client.execute(Queries.search, variables: [:])
        }
        #expect(await meter.cost == 3)
        #expect(await meter.lowest?.remaining == 4200)
    }

    @Test func recordsNothingForAnErrorWithoutData() async {
        let meter = RateMeter()
        let client = MeteredClient(inner: FakeGraphQLClient { _ in throw httpError(502) }, meter: meter)

        await #expect(throws: httpError(502)) { try await client.execute(Queries.search, variables: [:]) }
        #expect(await meter.cost == 0)
    }
}

/// Never answers; announces each request it is handed.
private final class HangingURLProtocol: URLProtocol, @unchecked Sendable {
    static let started = Gate()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.started.open() }
    override func stopLoading() {}
}

@Suite(.timeLimit(.minutes(1)))
struct URLSessionGraphQLClientCancellationTests {
    @Test func reportsACancelledRequestAsCancellationRatherThanANetworkFailure() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HangingURLProtocol.self]
        let client = URLSessionGraphQLClient(token: "t", session: URLSession(configuration: configuration))

        let request = Task { try await client.execute(Queries.viewer, variables: [:]) }
        // Cancelled mid-flight, so URLSession itself reports URLError.cancelled.
        await HangingURLProtocol.started.wait()
        request.cancel()

        let error = await #expect(throws: (any Error).self) { try await request.value }
        #expect(error is CancellationError)
        #expect(!isTransientError(error ?? CancellationError()))
    }
}

/// Forwards a call to another fake, as the TS tests wrap `inner`.
private func answer(_ client: FakeGraphQLClient, _ call: GraphQLCall) async throws -> JSONValue {
    let query = switch call.kind {
    case .viewer: Queries.viewer
    case .search: Queries.search
    case .details: Queries.details
    }
    let data = try await client.execute(query, variables: call.variables)
    return try JSONDecoder().decode(JSONValue.self, from: data)
}
