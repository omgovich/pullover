import Foundation
import PulloverCore
import Testing
@testable import PulloverKit

private let NOW = d("2026-08-10T12:00:00Z")
/// One minute and a second later: past `staleAfter`.
private let LATER = d("2026-08-10T12:01:01Z")

private func fixtures() -> [PullRequest] {
    let openThread = makeThread(id: "T_1", comments: [makeComment("bob", "2026-08-09T10:00:00Z", "Rename this?")])
    return [
        pr("PR_1", repository: "acme/web", number: 1, buckets: [.reviewRequested]) {
            $0.title = "Add search"
            $0.reviewRequestedAt = d("2026-08-09T09:00:00Z")
        },
        pr("PR_7", repository: "acme/api", number: 7, buckets: [.author]) {
            $0.title = "Retry writes"
            $0.authorLogin = "vlad"
            $0.reviewThreads = [openThread]
        },
        pr("PR_3", repository: "acme/web", number: 3, buckets: [.involves]) {
            $0.title = "Tidy tests"
            $0.reviews = [makeReview("vlad", "2026-08-08T10:00:00Z", state: .commented)]
        },
    ]
}

/// What a tool call came back with.
struct ToolAnswer {
    var isError: Bool
    var text: String
    var structured: JSONValue?

    init(_ reply: JSONValue?) {
        let result = reply?["result"]
        isError = result?["isError"] == .bool(true)
        text = result?["content"]?.arrayValue?.first?["text"]?.stringValue ?? ""
        structured = result?["structuredContent"]
    }

    var sections: [JSONValue] { structured?["sections"]?.arrayValue ?? [] }
    var categories: [String] { sections.compactMap { $0["category"]?.stringValue } }
    var numbers: [Int] {
        sections.flatMap { $0["pullRequests"]?.arrayValue ?? [] }.compactMap { $0["number"]?.integerValue.map { Int($0) } }
    }
}

/// An inbox over the fixtures, refreshed once, and the tools on top of it.
@MainActor
final class MCPHarness {
    let defaults: TestDefaults
    let store: AppStore
    let clock: TestClock
    let prs: Box<[PullRequest]>
    let fetches: Counter
    /// Parks the next fetch while set, so a pass can be left in flight on purpose.
    let hold: Box<Gate?>
    let inbox: Inbox
    let tools: MCPTools

    init(signedIn: Bool = true) async {
        let defaults = TestDefaults()
        let store = defaults.makeStore()
        let (clock, prs, fetches, hold) = (TestClock(NOW), Box(fixtures()), Counter(), Box<Gate?>(nil))
        (self.defaults, self.store, self.clock, self.prs, self.fetches, self.hold) = (defaults, store, clock, prs, fetches, hold)
        inbox = Inbox(
            store: store,
            clientProvider: signedIn ? { DummyClient() } : { nil },
            now: { clock.now },
            fetchPRs: { _, _ in
                fetches.increment()
                await hold.value?.wait()
                return fetched(prs.value)
            },
            fetchLogin: { _ in "vlad" }
        )
        await inbox.refresh()
        tools = MCPTools(inbox: inbox, store: store, version: "0.0.0-test", now: { clock.now })
    }

    func request(_ method: String, _ params: JSONValue? = nil, id: JSONValue = 1) async -> JSONValue? {
        var message: [String: JSONValue] = ["jsonrpc": "2.0", "id": id, "method": .string(method)]
        if let params { message["params"] = params }
        return await tools.handle(.object(message))
    }

    func call(_ name: String, _ arguments: [String: JSONValue] = [:]) async -> ToolAnswer {
        ToolAnswer(await request("tools/call", ["name": .string(name), "arguments": .object(arguments)]))
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MCPProtocolTests {
    @Test func initializeAgreesToAVersionItSupports() async {
        let h = await MCPHarness()
        let reply = await h.request("initialize", [
            "protocolVersion": "2025-03-26",
            "capabilities": [:],
            "clientInfo": ["name": "test", "version": "0"],
        ])
        let result = reply?["result"]
        #expect(reply?["id"] == 1)
        #expect(result?["protocolVersion"] == "2025-03-26")
        #expect(result?["serverInfo"] == ["name": "pullover", "version": "0.0.0-test"])
        #expect(result?["capabilities"]?["tools"] != nil)
    }

    @Test func initializeOffersItsNewestVersionForOneItDoesNotKnow() async {
        let h = await MCPHarness()
        let unknown = await h.request("initialize", ["protocolVersion": "1999-01-01"])
        #expect(unknown?["result"]?["protocolVersion"] == "2025-06-18")
        let missing = await h.request("initialize", [:])
        #expect(missing?["result"]?["protocolVersion"] == "2025-06-18")
    }

    @Test func answersAPing() async {
        let h = await MCPHarness()
        #expect(await h.request("ping", id: "abc") == ["jsonrpc": "2.0", "id": "abc", "result": [:]])
    }

    @Test func refusesARequestWithoutJSONRPC2() async {
        let h = await MCPHarness()
        let missing = await h.tools.handle(["id": 7, "method": "ping"])
        #expect(missing?["error"]?["code"] == -32600)
        #expect(missing?["id"] == 7)
        let wrong = await h.tools.handle(["jsonrpc": "1.0", "id": 8, "method": "tools/list"])
        #expect(wrong?["error"]?["code"] == -32600)
        #expect(wrong?["result"] == nil)
    }

    @Test func staysSilentForANotification() async {
        let h = await MCPHarness()
        #expect(await h.tools.handle(["jsonrpc": "2.0", "method": "notifications/initialized"]) == nil)
    }

    @Test func refusesAnUnknownMethodAndAnUnknownTool() async {
        let h = await MCPHarness()
        #expect(await h.request("resources/list")?["error"]?["code"] == -32601)
        #expect(await h.request("tools/call", ["name": "rm_rf"])?["error"]?["code"] == -32602)
        #expect(await h.request("tools/call", [:])?["error"]?["code"] == -32602)
    }

    @Test func refusesSomethingThatIsNotARequest() async {
        let h = await MCPHarness()
        #expect(await h.tools.handle("hello")?["error"]?["code"] == -32600)
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MCPToolsListTests {
    private func tools() async -> [JSONValue] {
        let h = await MCPHarness()
        return await h.request("tools/list")?["result"]?["tools"]?.arrayValue ?? []
    }

    @Test func offersTheThreeTools() async {
        #expect(await tools().compactMap { $0["name"]?.stringValue } == [
            "get_inbox", "snooze_pull_request", "unsnooze_pull_request",
        ])
    }

    @Test func describesEachToolsArguments() async {
        let byName = Dictionary(uniqueKeysWithValues: await tools().map { ($0["name"]?.stringValue ?? "", $0) })

        let inbox = byName["get_inbox"]?["inputSchema"]
        #expect(inbox?["type"] == "object")
        #expect(inbox?["properties"]?["includeWaiting"]?["type"] == "boolean")
        #expect(inbox?["additionalProperties"] == false)

        let snooze = byName["snooze_pull_request"]?["inputSchema"]
        #expect(snooze?["required"] == ["repository", "number"])
        #expect(snooze?["properties"]?["repository"]?["type"] == "string")
        #expect(snooze?["properties"]?["number"]?["type"] == "integer")
        #expect(snooze?["properties"]?["hours"]?["minimum"] == 1)
        #expect(snooze?["properties"]?["hours"]?["maximum"] == 336)

        let unsnooze = byName["unsnooze_pull_request"]?["inputSchema"]
        #expect(unsnooze?["required"] == ["repository", "number"])
        #expect(unsnooze?["properties"]?["hours"] == nil)

        for tool in byName.values {
            #expect(tool["description"]?.stringValue?.isEmpty == false)
        }
    }

    @Test func tellsClientsASnoozeIsNotSafeToRetryBecauseItMovesTheDeadline() async {
        let byName = Dictionary(uniqueKeysWithValues: await tools().map { ($0["name"]?.stringValue ?? "", $0) })
        #expect(byName["get_inbox"]?["annotations"]?["readOnlyHint"] == true)
        #expect(byName["snooze_pull_request"]?["annotations"]?["idempotentHint"] == false)
        #expect(byName["unsnooze_pull_request"]?["annotations"]?["idempotentHint"] == true)
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MCPGetInboxTests {
    @Test func returnsTheAttentionSectionsByDefault() async {
        let h = await MCPHarness()
        let answer = await h.call("get_inbox")
        #expect(!answer.isError)
        #expect(answer.structured?["myLogin"] == "vlad")
        #expect(answer.categories == ["needs-review", "my-pr-action"])
    }

    @Test func addsTheWaitingSectionWhenAsked() async {
        let h = await MCPHarness()
        #expect(await h.call("get_inbox", ["includeWaiting": true]).categories == ["needs-review", "my-pr-action", "waiting"])
    }

    @Test func refusesAnIncludeWaitingThatIsNotABoolean() async {
        let h = await MCPHarness()
        #expect(await h.call("get_inbox", ["includeWaiting": "yes"]).isError)
    }

    @Test func alsoPutsTheJSONInTheTextContentForClientsThatIgnoreStructuredOutput() async throws {
        let h = await MCPHarness()
        let answer = await h.call("get_inbox")
        let parsed = try JSONDecoder().decode(JSONValue.self, from: Data(answer.text.utf8))
        #expect(parsed["myLogin"] == "vlad")
        #expect(parsed == answer.structured)
    }

    @Test func answersFromTheSnapshotWhileItIsFresh() async {
        let h = await MCPHarness()
        _ = await h.call("get_inbox")
        #expect(h.fetches.count == 1)
    }

    @Test func waitsForAPassInFlightRatherThanAnsweringFromTheListItReplaces() async {
        let h = await MCPHarness()
        h.clock.now = LATER
        h.prs.value = [pr("PR_50", number: 50, buckets: [.reviewRequested])]
        let gate = Gate()
        h.hold.value = gate

        let pass = Task { await h.inbox.refresh() }
        await h.fetches.waitFor(2)
        let answer = Task { await h.call("get_inbox") }
        // Without the wait, the call would answer now, from the loading snapshot.
        await settle()
        gate.open()

        let result = await answer.value
        await pass.value

        #expect(result.structured?["status"] == "ready")
        #expect(result.numbers == [50])
        // The pass it waited for, and no second one on top.
        #expect(h.fetches.count == 2)
    }

    @Test func refreshesFirstOnceTheSnapshotIsStaleLikeOpeningThePopupDoes() async {
        let h = await MCPHarness()
        h.clock.now = LATER
        h.prs.value = [pr("PR_50", number: 50, buckets: [.reviewRequested])]

        let answer = await h.call("get_inbox")

        #expect(h.fetches.count == 2)
        #expect(answer.structured?["lastUpdatedAt"] == .string(ISODate.string(LATER)))
        #expect(answer.numbers == [50])
    }

    @Test func saysSoAndPointsAtTheWindowWhileSignedOut() async {
        let h = await MCPHarness(signedIn: false)
        let answer = await h.call("get_inbox")
        #expect(!answer.isError)
        #expect(answer.structured?["status"] == "signed-out")
        #expect(answer.structured?["myLogin"] == .null)
        #expect(answer.structured?["sections"] == [])
        #expect(answer.structured?["notice"]?.stringValue?.lowercased().contains("sign in") == true)
        // Signed out, a stale snapshot is no reason to fetch.
        #expect(h.fetches.count == 0)
    }

    @Test func servesCallersWhoArriveDuringAPassFromThatOneFetch() async {
        let h = await MCPHarness()
        h.clock.now = LATER
        h.prs.value = [pr("PR_50", number: 50, buckets: [.reviewRequested])]
        let gate = Gate()
        h.hold.value = gate

        let pass = Task { await h.inbox.refresh() }
        await h.fetches.waitFor(2)
        let first = Task { await h.call("get_inbox") }
        let second = Task { await h.call("get_inbox") }
        await settle()
        gate.open()

        for answer in [await first.value, await second.value] {
            #expect(answer.structured?["status"] == "ready")
            #expect(answer.numbers == [50])
        }
        await pass.value
        #expect(h.fetches.count == 2)
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MCPSnoozeToolTests {
    @Test func parksAPullRequestUntilNewActivityAndReportsItsNewState() async {
        let h = await MCPHarness()
        let answer = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1])
        #expect(!answer.isError)
        #expect(h.store.snoozes["PR_1"]?.type == .untilActivity)
        #expect(h.store.snoozes["PR_1"]?.snoozedAt == NOW)
        #expect(answer.structured?["number"] == 1)
        #expect(answer.structured?["category"] == "waiting")
        #expect(answer.structured?["reason"] == "Snoozed")
        #expect(answer.structured?["isSnoozed"] == true)
    }

    @Test func takesItOutOfTheAttentionSectionsStraightAway() async {
        let h = await MCPHarness()
        _ = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1])
        #expect(!(await h.call("get_inbox").numbers.contains(1)))
    }

    @Test func parksItForANumberOfHoursInsteadWhenGivenOne() async {
        let h = await MCPHarness()
        _ = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1, "hours": 4])
        #expect(h.store.snoozes["PR_1"]?.type == .untilTime)
        #expect(h.store.snoozes["PR_1"]?.until == d("2026-08-10T16:00:00Z"))
    }

    @Test func matchesTheRepositoryNameWhateverItsCase() async {
        let h = await MCPHarness()
        let answer = await h.call("snooze_pull_request", ["repository": "ACME/Web", "number": 1])
        #expect(!answer.isError)
        #expect(h.store.snoozes["PR_1"] != nil)
    }

    @Test func unsnoozesPuttingThePullRequestBackWhereItWas() async {
        let h = await MCPHarness()
        _ = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1])
        let answer = await h.call("unsnooze_pull_request", ["repository": "acme/web", "number": 1])
        #expect(!answer.isError)
        #expect(h.store.snoozes["PR_1"] == nil)
        #expect(answer.structured?["category"] == "needs-review")
        #expect(answer.structured?["isSnoozed"] == false)
    }

    @Test func unsnoozesAPullRequestThatWentToDraftWhileItWasParked() async {
        let h = await MCPHarness()
        _ = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1, "hours": 336])
        #expect(h.store.snoozes["PR_1"] != nil)

        h.prs.value = h.prs.value.map { item in
            var item = item
            if item.id == "PR_1" { item.isDraft = true }
            return item
        }
        h.clock.now = LATER
        await h.inbox.refresh()

        let answer = await h.call("unsnooze_pull_request", ["repository": "acme/web", "number": 1])
        #expect(!answer.isError)
        #expect(h.store.snoozes.isEmpty)
    }

    @Test func unsnoozesAPullRequestThatWasNeverParkedWithoutComplaining() async {
        let h = await MCPHarness()
        let answer = await h.call("unsnooze_pull_request", ["repository": "acme/web", "number": 1])
        #expect(!answer.isError)
        #expect(answer.structured?["category"] == "needs-review")
        #expect(answer.structured?["isSnoozed"] == false)
    }

    @Test func refusesADraftRatherThanWritingASnoozeThatCannotTakeEffect() async {
        let h = await MCPHarness()
        h.prs.value = [pr("PR_D", number: 5, buckets: [.reviewRequested]) { $0.isDraft = true }]
        await h.inbox.refresh()

        let answer = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 5])
        #expect(answer.isError)
        #expect(answer.text.lowercased().contains("draft"))
        #expect(h.store.snoozes.isEmpty)
    }

    @Test func refusesAHiddenPullRequestThatIsNotADraftWithoutCallingItOne() async {
        let h = await MCPHarness()
        h.prs.value = [pr("PR_H", repository: "acme/api", number: 8, buckets: [.author]) {
            $0.authorLogin = "vlad"
            $0.reviewDecision = .approved
            $0.hasAutoMerge = true
            $0.reviews = [makeReview("bob", "2026-08-09T10:00:00Z", state: .approved)]
        }]
        await h.inbox.refresh()

        let answer = await h.call("snooze_pull_request", ["repository": "acme/api", "number": 8])
        #expect(answer.isError)
        #expect(!answer.text.lowercased().contains("draft"))
        #expect(answer.text.lowercased().contains("not in the inbox"))
        #expect(h.store.snoozes.isEmpty)
    }

    @Test(arguments: [
        JSONValue.number(0),
        .number(2.5),
        .number(100_000),
        .number(-3),
        .string("4"),
        .number(1e20),
        .number(-1e20),
        .number(.infinity),
        .number(.nan),
        .integer(.max),
    ])
    func refusesAParkLengthThatIsNotAWholeNumberOfHoursFrom1To336(hours: JSONValue) async {
        let h = await MCPHarness()
        let answer = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1, "hours": hours])
        #expect(answer.isError)
        #expect(h.store.snoozes.isEmpty)
    }

    @Test(arguments: [
        ["number": 1] as [String: JSONValue],
        ["repository": "", "number": 1],
        ["repository": "acme/web"],
        ["repository": "acme/web", "number": 0],
        ["repository": "acme/web", "number": .number(1.5)],
        // Whole numbers that `Int(_:)` would trap on.
        ["repository": "acme/web", "number": .number(1e20)],
        ["repository": "acme/web", "number": .number(-1e20)],
        ["repository": "acme/web", "number": .number(.infinity)],
        ["repository": "acme/web", "number": .number(.nan)],
        ["repository": "acme/web", "number": .integer(-1)],
    ])
    func refusesAMissingOrMalformedIdentifier(arguments: [String: JSONValue]) async {
        let h = await MCPHarness()
        let answer = await h.call("snooze_pull_request", arguments)
        #expect(answer.isError)
        #expect(answer.text.hasPrefix("Invalid arguments"))
        #expect(h.store.snoozes.isEmpty)
    }

    @Test func refusesHugeNumbersSentAsJSONInsteadOfCrashing() async throws {
        let h = await MCPHarness()
        for arguments in [#"{"repository":"acme/web","number":1e20}"#, #"{"repository":"acme/web","number":1,"hours":1e20}"#] {
            let message = try JSONDecoder().decode(JSONValue.self, from: Data(
                #"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"snooze_pull_request","arguments":\#(arguments)}}"#.utf8
            ))
            let answer = ToolAnswer(await h.tools.handle(message))
            #expect(answer.isError)
            #expect(answer.text.hasPrefix("Invalid arguments"))
        }
        #expect(h.store.snoozes.isEmpty)
    }

    @Test func takesAWholeNumberOfHoursWrittenAsADouble() async {
        let h = await MCPHarness()
        let answer = await h.call("snooze_pull_request", ["repository": "acme/web", "number": .number(1), "hours": .number(4)])
        #expect(!answer.isError)
        #expect(h.store.snoozes["PR_1"]?.until == d("2026-08-10T16:00:00Z"))
    }

    @Test func saysItIsSignedOutRatherThanSendingTheAgentToAnEmptyInbox() async {
        let h = await MCPHarness(signedIn: false)
        let answer = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1])
        #expect(answer.isError)
        #expect(answer.text.lowercased().contains("signed out"))
    }

    @Test func refusesAPullRequestItHasNeverSeenAndWritesNothing() async {
        let h = await MCPHarness()
        let answer = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 404])
        #expect(answer.isError)
        #expect(answer.text.lowercased().contains("only tracks open pull requests"))
        #expect(h.store.snoozes.isEmpty)
    }

    @Test func neverRefreshesSoABulkTriageDoesNotCostAFetchPerPullRequest() async {
        let h = await MCPHarness()
        h.clock.now = LATER
        _ = await h.call("snooze_pull_request", ["repository": "acme/web", "number": 1])
        _ = await h.call("unsnooze_pull_request", ["repository": "acme/web", "number": 1])
        #expect(h.fetches.count == 1)
    }
}
