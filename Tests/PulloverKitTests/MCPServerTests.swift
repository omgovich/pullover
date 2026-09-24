import Foundation
import Network
import PulloverCore
import Testing
@testable import PulloverKit

private let port = 7855

/// Echoes a request's id back, and stays silent for a notification.
private let echo: MCPServer.Handler = { message in
    guard let id = message["id"] else { return nil }
    return ["jsonrpc": "2.0", "id": id, "result": [:]]
}

private let ping = Data(#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#.utf8)

private func post(
    _ headers: [String: String] = [:],
    method: String = "POST",
    path: String = "/mcp",
    body: Data = ping
) -> HTTPRequest {
    HTTPRequest(
        method: method,
        target: path,
        headers: ["Host": "127.0.0.1:\(port)", "Content-Type": "application/json"].merging(headers) { _, new in new },
        body: body
    )
}

private func respond(_ request: HTTPRequest) async -> HTTPResponse {
    await MCPServer.respond(to: request, port: port, handler: echo)
}

private func json(_ response: HTTPResponse) -> JSONValue? {
    decodeJSON(response.body)
}

@Suite struct RefusalTests {
    @Test func allowsTheLoopbackHostsWithTheRightPortAndNothingElse() {
        #expect(refusal(for: ["host": "127.0.0.1:7855"], port: 7855) == nil)
        #expect(refusal(for: ["host": "localhost:7855"], port: 7855) == nil)
        #expect(refusal(for: ["host": "127.0.0.1:7856"], port: 7855)?.contains("Host") == true)
        #expect(refusal(for: [:], port: 7855)?.contains("Host") == true)
        // Case-insensitive per RFC 9110, so a legitimate client is not refused.
        #expect(refusal(for: ["host": "LocalHost:7855"], port: 7855) == nil)
    }

    @Test func allowsAMissingOriginAndALoopbackOneAndRefusesAnyOther() {
        #expect(refusal(for: ["host": "localhost:7855"], port: 7855) == nil)
        #expect(refusal(for: ["host": "localhost:7855", "origin": "http://127.0.0.1:7855"], port: 7855) == nil)
        #expect(refusal(for: ["host": "localhost:7855", "origin": "https://github.com"], port: 7855)?.contains("Origin") == true)
        #expect(refusal(for: ["host": "localhost:7855", "origin": "HTTP://LOCALHOST:7855"], port: 7855) == nil)
    }
}

@Suite struct MCPRespondTests {
    @Test func refusesAForeignHostWithAJSONRPCError() async {
        let response = await respond(post(["Host": "evil.example"]))
        #expect(response.status == 403)
        #expect(json(response)?["jsonrpc"] == "2.0")
        #expect(json(response)?["error"]?["code"] == -32000)
    }

    @Test func refusesAForeignOrigin() async {
        #expect(await respond(post(["Origin": "http://evil.example"])).status == 403)
    }

    @Test func acceptsALocalOrigin() async {
        #expect(await respond(post(["Origin": "http://localhost:\(port)"])).status == 200)
    }

    @Test func acceptsAHostHeaderInAnotherCase() async {
        #expect(await respond(post(["Host": "LOCALHOST:\(port)"])).status == 200)
    }

    @Test func checksTheHostBeforeAnythingElse() async {
        #expect(await respond(post(["Host": "evil.example"], method: "GET", path: "/")).status == 403)
    }

    @Test func answers405ToGETOnMcpNamingTheMethodItServes() async {
        let response = await respond(post(method: "GET"))
        #expect(response.status == 405)
        #expect(response.headers["Allow"] == "POST")
    }

    @Test func answers404OffMcp() async {
        #expect(await respond(post(path: "/")).status == 404)
        #expect(await respond(post(path: "/mcp/extra")).status == 404)
    }

    @Test func servesMcpWithAQueryString() async {
        #expect(await respond(post(path: "/mcp?session=1")).status == 200)
    }

    // The TS server answered 400 to an unparseable target like `//[`, which
    // `new URL` threw on. Here it falls through to the path check: still answered.
    @Test func answersARequestTargetItCannotParse() async {
        let response = await respond(post(path: "//["))
        #expect(response.status == 404)
        #expect(json(response)?["error"]?["code"] == -32000)
    }

    @Test func answers400ToABodyThatIsNotJSON() async {
        let response = await respond(post(body: Data("{not json".utf8)))
        #expect(response.status == 400)
        #expect(json(response)?["error"]?["code"] == -32700)
    }

    @Test func answersARequestWithTheHandlersReplyAsJSON() async {
        let response = await respond(post())
        #expect(response.status == 200)
        #expect(response.headers["Content-Type"] == "application/json")
        #expect(json(response) == ["jsonrpc": "2.0", "id": 1, "result": [:]])
    }

    @Test func refusesAnEmptyBatchAsAnInvalidRequest() async {
        let response = await respond(post(body: Data("[]".utf8)))
        #expect(response.status == 400)
        #expect(json(response)?["error"]?["code"] == -32600)
    }

    @Test func answers202WithNoBodyToANotification() async {
        let response = await respond(post(body: Data(#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#.utf8)))
        #expect(response.status == 202)
        #expect(response.body.isEmpty)
    }

    @Test func answersABatchWithTheRepliesItProducedAndNothingForItsNotifications() async {
        let batch = Data(#"[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","method":"n"},{"jsonrpc":"2.0","id":2,"method":"ping"}]"#.utf8)
        let response = await respond(post(body: batch))
        #expect(response.status == 200)
        #expect(json(response)?.arrayValue?.compactMap { $0["id"] } == [1, 2])

        let notifications = Data(#"[{"jsonrpc":"2.0","method":"n"}]"#.utf8)
        #expect(await respond(post(body: notifications)).status == 202)
    }

    @Test func echoesARequestIdAbove2To53Exactly() async {
        // 2^53 + 1, which a Double rounds to 2^53.
        let body = Data(#"{"jsonrpc":"2.0","id":9007199254740993,"method":"ping"}"#.utf8)
        let response = await respond(post(body: body))
        #expect(String(decoding: response.body, as: UTF8.self).contains(#""id":9007199254740993"#))
        #expect(json(response)?["id"]?.integerValue == 9_007_199_254_740_993)
    }

    @Test func callsNoHandlerOnceTheConnectionIsClosed() async {
        let calls = Counter()
        let counting: MCPServer.Handler = { message in
            calls.increment()
            return await echo(message)
        }
        let response = await MCPServer.respond(to: post(), port: port, handler: counting, isOpen: { false })
        #expect(response.status == 503)
        let batch = Data(#"[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","id":2,"method":"ping"}]"#.utf8)
        #expect(await MCPServer.respond(to: post(body: batch), port: port, handler: counting, isOpen: { false }).status == 503)
        #expect(calls.count == 0)
    }

    @Test func serialisesAResponseWithItsLengthAndClosesTheConnection() {
        let text = String(decoding: HTTPResponse(status: 202).serialized(), as: UTF8.self)
        #expect(text.hasPrefix("HTTP/1.1 202 Accepted\r\n"))
        #expect(text.contains("Content-Length: 0\r\n"))
        #expect(text.contains("Connection: close\r\n"))
        #expect(text.hasSuffix("\r\n\r\n"))
    }
}

@Suite struct ParseHTTPRequestTests {
    private func raw(_ text: String) -> Data { Data(text.utf8) }

    @Test func parsesARequestWithABodySizedByContentLength() {
        let result = parseHTTPRequest(raw("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:7855\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}"))
        #expect(result == .complete(HTTPRequest(
            method: "POST",
            target: "/mcp",
            headers: ["host": "127.0.0.1:7855", "content-type": "application/json", "content-length": "2"],
            body: raw("{}")
        )))
    }

    @Test func lowercasesHeaderNamesAndTrimsTheirValues() {
        guard case let .complete(request) = parseHTTPRequest(raw("GET / HTTP/1.1\r\nX-Thing:   spaced out  \r\n\r\n")) else {
            Issue.record("expected a complete request")
            return
        }
        #expect(request.headers == ["x-thing": "spaced out"])
        #expect(request.body.isEmpty)
    }

    @Test func waitsForTheRestOfTheHeadOrBody() {
        #expect(parseHTTPRequest(raw("POST /mcp HTTP/1.1\r\nHost: x\r\n")) == .incomplete)
        #expect(parseHTTPRequest(raw("POST /mcp HTTP/1.1\r\nContent-Length: 10\r\n\r\n{}")) == .incomplete)
    }

    @Test func ignoresBytesPastTheDeclaredBody() {
        guard case let .complete(request) = parseHTTPRequest(raw("POST /mcp HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}extra")) else {
            Issue.record("expected a complete request")
            return
        }
        #expect(request.body == raw("{}"))
    }

    @Test func refusesAMalformedRequestLine() {
        guard case .invalid = parseHTTPRequest(raw("POST /mcp\r\n\r\n")) else {
            Issue.record("expected invalid")
            return
        }
        guard case .invalid = parseHTTPRequest(raw("POST /mcp SPDY/3\r\n\r\n")) else {
            Issue.record("expected invalid")
            return
        }
    }

    @Test func refusesAHeaderWithoutAColon() {
        guard case .invalid = parseHTTPRequest(raw("POST /mcp HTTP/1.1\r\nNoColonHere\r\n\r\n")) else {
            Issue.record("expected invalid")
            return
        }
    }

    @Test func refusesAChunkedUpload() {
        #expect(parseHTTPRequest(raw("POST /mcp HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n")) == .invalid("Chunked requests are not supported"))
    }

    @Test func refusesABodyLargerThanItAccepts() {
        #expect(parseHTTPRequest(raw("POST /mcp HTTP/1.1\r\nContent-Length: \(maxRequestBody + 1)\r\n\r\n")) == .tooLarge)
    }

    @Test func refusesAHeadThatNeverEnds() {
        #expect(parseHTTPRequest(Data(repeating: UInt8(ascii: "a"), count: 64 * 1024 + 1)) == .tooLarge)
    }

    @Test func refusesAHeadOverTheLimitEvenOnceItHasEnded() {
        let big = "POST /mcp HTTP/1.1\r\nX-Big: \(String(repeating: "a", count: maxRequestHead))\r\n\r\n"
        #expect(parseHTTPRequest(raw(big)) == .tooLarge)
    }

    @Test func acceptsAHeadExactlyAtTheLimit() {
        let prefix = "GET / HTTP/1.1\r\nX: "
        let head = prefix + String(repeating: "a", count: maxRequestHead - prefix.utf8.count)
        #expect(head.utf8.count == maxRequestHead)
        guard case .complete = parseHTTPRequest(raw(head + "\r\n\r\n")) else {
            Issue.record("expected a complete request")
            return
        }
    }

    @Test func readsThePathWithoutTheQuery() {
        #expect(HTTPRequest(method: "POST", target: "/mcp?x=1").path == "/mcp")
    }
}

/// A POST over a real socket.
private func send(_ body: Data, to port: Int, headers: [String: String] = [:]) async throws -> (status: Int, body: Data) {
    var request = URLRequest(url: URL(string: mcpURL(port: port))!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json, text/event-stream", forHTTPHeaderField: "Accept")
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    request.httpBody = body
    let (data, response) = try await URLSession.shared.data(for: request)
    return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
}

/// Opens a raw TCP connection, sends `text`, and returns once the server closes it.
private func closedAfterSending(_ text: String, to port: Int) async -> Bool {
    let connection = NWConnection(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: UInt16(port))!, using: .tcp)
    let queue = DispatchQueue(label: "PulloverKitTests.raw")
    connection.start(queue: queue)
    defer { connection.cancel() }
    return await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
        connection.send(content: Data(text.utf8), completion: .contentProcessed { _ in })
        @Sendable func drain() {
            connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { data, _, isComplete, error in
                if isComplete || error != nil {
                    continuation.resume(returning: data?.isEmpty ?? true)
                } else {
                    drain()
                }
            }
        }
        drain()
    }
}

@Suite struct JSONValueNumberTests {
    private func roundTrip(_ text: String) throws -> String {
        let value = try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
        return String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }

    @Test func keepsIntegersBeyondADoublesPrecisionExactly() throws {
        #expect(try roundTrip("9007199254740993") == "9007199254740993")
        #expect(try roundTrip("9223372036854775807") == "9223372036854775807")
        #expect(try roundTrip("-9223372036854775808") == "-9223372036854775808")
        #expect(try JSONDecoder().decode(JSONValue.self, from: Data("9007199254740993".utf8)) == .integer(9_007_199_254_740_993))
    }

    @Test func keepsFractionsAndHugeNumbersAsDoubles() throws {
        #expect(try JSONDecoder().decode(JSONValue.self, from: Data("2.5".utf8)) == .number(2.5))
        let huge = try JSONDecoder().decode(JSONValue.self, from: Data("1e20".utf8))
        #expect(huge.numberValue == 1e20)
        #expect(huge.integerValue == nil)
    }

    @Test func comparesAndHashesTheTwoNumberCasesByValue() {
        #expect(JSONValue.integer(4) == .number(4))
        #expect(JSONValue.number(4) == .integer(4))
        #expect(JSONValue.integer(4) != .number(4.5))
        #expect(Set<JSONValue>([.integer(4), .number(4)]).count == 1)
        #expect(JSONValue.integer(9_007_199_254_740_993) != .number(9_007_199_254_740_992))
    }

    @Test func offersBothAnExactIntegerAndADouble() {
        #expect(JSONValue.integer(7).numberValue == 7)
        #expect(JSONValue.number(7).integerValue == 7)
        #expect(JSONValue.number(7.5).integerValue == nil)
        #expect(JSONValue.number(.infinity).integerValue == nil)
        #expect(JSONValue.number(.nan).integerValue == nil)
        #expect(JSONValue.string("7").integerValue == nil)
    }
}

/// A raw TCP client, for a request sent in pieces.
private final class RawClient: @unchecked Sendable {
    let connection: NWConnection

    init(port: Int) {
        connection = NWConnection(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: UInt16(port))!, using: .tcp)
        connection.start(queue: DispatchQueue(label: "PulloverKitTests.rawClient"))
    }

    deinit { connection.cancel() }

    func send(_ text: String) {
        connection.send(content: Data(text.utf8), completion: .contentProcessed { _ in })
    }

    /// Everything the server sent, once it has closed the connection.
    func untilClosed() async -> Data {
        await withCheckedContinuation { (continuation: CheckedContinuation<Data, Never>) in
            let received = Box(Data())
            @Sendable func drain() {
                connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { data, _, isComplete, error in
                    if let data { received.value.append(data) }
                    if isComplete || error != nil {
                        continuation.resume(returning: received.value)
                    } else {
                        drain()
                    }
                }
            }
            drain()
        }
    }
}

/// Polls `condition` on the main actor until it holds, for at most five seconds.
@MainActor
private func eventually(_ condition: () -> Bool) async -> Bool {
    let deadline = ContinuousClock.now + .seconds(5)
    while !condition() {
        if ContinuousClock.now > deadline { return false }
        try? await Task.sleep(for: .milliseconds(5))
    }
    return true
}

@MainActor
@Suite(.serialized, .timeLimit(.minutes(1)))
struct MCPServerLifecycleTests {
    private func makeServer() -> MCPServer { MCPServer(handleMessage: echo) }

    private func listening() async throws -> (MCPServer, Int) {
        let server = makeServer()
        await server.start(port: 0)
        let port = try #require(server.status.port)
        #expect(server.status.listening)
        #expect(server.status.error == nil)
        return (server, port)
    }

    @Test func answersOverASocketOnThePortItBound() async throws {
        let (server, port) = try await listening()
        defer { server.stop() }

        let reply = try await send(ping, to: port)
        #expect(reply.status == 200)
        #expect(decodeJSON(reply.body) == ["jsonrpc": "2.0", "id": 1, "result": [:]])
    }

    @Test func refusesAForeignOriginOverASocket() async throws {
        let (server, port) = try await listening()
        defer { server.stop() }

        #expect(try await send(ping, to: port, headers: ["Origin": "http://evil.example"]).status == 403)
    }

    @Test func servesTheToolsEndToEnd() async throws {
        let h = await MCPHarness()
        let tools = h.tools
        let server = MCPServer { await tools.handle($0) }
        await server.start(port: 0)
        defer { server.stop() }
        let port = try #require(server.status.port)

        let body = Data(#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_inbox","arguments":{}}}"#.utf8)
        let reply = try await send(body, to: port)

        #expect(reply.status == 200)
        let result = decodeJSON(reply.body)?["result"]
        #expect(result?["structuredContent"]?["myLogin"] == "vlad")
        #expect(result?["isError"] == nil)
    }

    @Test func reportsAPortThatIsAlreadyTakenInsteadOfThrowing() async throws {
        let (server, port) = try await listening()
        defer { server.stop() }

        let second = makeServer()
        await second.start(port: port)
        #expect(second.status.listening == false)
        #expect(second.status.port == nil)
        #expect(second.status.error?.contains("in use") == true)
        second.stop()
    }

    @Test func leavesNothingListeningWhenAStopLandsDuringABind() async {
        let server = makeServer()
        var stoppedDuringBind = false
        // Stop underneath `start` the moment it waits for its listener, before
        // that listener can report anything, as a double-click on the settings
        // switch does.
        server.didBeginBinding = { [unowned server] in
            server.stop()
            stoppedDuringBind = true
        }
        await server.start(port: 0)
        #expect(stoppedDuringBind)
        #expect(server.status == .stopped)

        // And the listener it abandoned lets a later start bind.
        server.didBeginBinding = nil
        await server.start(port: 0)
        #expect(server.status.listening)
        server.stop()
    }

    @Test(arguments: [-1, 65536, 70000, Int.min])
    func refusesAPortOutsideTheTCPRangeRatherThanBindingAnotherOne(bad: Int) async throws {
        let (server, running) = try await listening()
        defer { server.stop() }

        await server.start(port: bad)
        #expect(server.status.listening == false)
        #expect(server.status.port == nil)
        #expect(server.status.error?.contains("not a TCP port") == true)
        // The listener it replaced is gone too, so nothing serves a port nobody asked for.
        await #expect(throws: (any Error).self) { _ = try await send(ping, to: running) }
    }

    @Test func closesTheConnectionsItAcceptedWhenStopped() async throws {
        let calls = Counter()
        let server = MCPServer { message in
            calls.increment()
            return await echo(message)
        }
        await server.start(port: 0)
        defer { server.stop() }
        let port = try #require(server.status.port)

        let body = String(decoding: ping, as: UTF8.self)
        let client = RawClient(port: port)
        client.send("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:\(port)\r\nContent-Length: \(ping.count)\r\n\r\n")
        #expect(await eventually { server.openConnectionCount == 1 })

        server.stop()
        #expect(server.openConnectionCount == 0)
        // The rest of the request, which the Node server would never have seen.
        client.send(body)
        let answer = await client.untilClosed()

        #expect(answer.isEmpty)
        #expect(calls.count == 0)
    }

    @Test func doesNotReportAConflictAgainstAListenerOfItsOwn() async throws {
        let (probe, free) = try await listening()
        probe.stop()

        let server = makeServer()
        async let first: Void = server.start(port: free)
        async let second: Void = server.start(port: free)
        _ = await (first, second)
        #expect(server.status == MCPServerStatus(listening: true, port: free, error: nil))
        server.stop()
    }

    @Test func letsBothOfTwoOverlappingStartsReturn() async {
        let server = makeServer()
        let first = Task { await server.start(port: 0) }
        await Task.yield()
        await server.start(port: 0)
        await first.value
        #expect(server.status.listening)
        server.stop()
    }

    @Test func reportsEveryStatusChange() async throws {
        let (server, port) = try await listening()
        defer { server.stop() }

        let second = makeServer()
        var seen: [MCPServerStatus] = []
        second.onStatusChange = { seen.append($0) }
        await second.start(port: port)
        await second.start(port: 0)
        second.stop()
        second.stop()

        #expect(seen.count == 4)
        #expect(seen.first?.error?.contains("in use") == true)
        #expect(seen.dropFirst().first == .stopped)
        #expect(seen.dropFirst(2).first?.listening == true)
        #expect(seen.last == .stopped)
    }

    @Test func closesAConnectionThatNeverFinishesItsRequest() async throws {
        let server = MCPServer(idleTimeout: 0.2, handleMessage: echo)
        await server.start(port: 0)
        defer { server.stop() }
        let port = try #require(server.status.port)

        // Closed with no answer at all.
        #expect(await closedAfterSending("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:\(port)\r\n", to: port))
        // A request that does arrive in time is still answered.
        #expect(try await send(ping, to: port).status == 200)
    }

    @Test func restartsOnTheSamePortWithoutTrippingOverItsOwnListener() async throws {
        let (server, port) = try await listening()
        defer { server.stop() }

        await server.start(port: port)
        #expect(server.status == MCPServerStatus(listening: true, port: port, error: nil))
        server.stop()
        await server.start(port: port)
        #expect(server.status == MCPServerStatus(listening: true, port: port, error: nil))
        #expect(try await send(ping, to: port).status == 200)
    }

    @Test func stopsTwiceWithoutComplaint() async throws {
        let (server, _) = try await listening()
        server.stop()
        server.stop()
        #expect(server.status.listening == false)
    }

    @Test func clearsAnEarlierBindFailureOnceAStartSucceeds() async throws {
        let (server, port) = try await listening()
        defer { server.stop() }

        let second = makeServer()
        await second.start(port: port)
        #expect(second.status.error?.contains("in use") == true)
        await second.start(port: 0)
        #expect(second.status.listening)
        #expect(second.status.error == nil)
        second.stop()
    }

    @Test func forgetsABindFailureOnceItIsStopped() async throws {
        let (server, port) = try await listening()
        defer { server.stop() }

        let second = makeServer()
        await second.start(port: port)
        #expect(second.status.error?.contains("in use") == true)
        second.stop()
        #expect(second.status.error == nil)
    }

    @Test func isNotListeningAfterStop() async throws {
        let (server, port) = try await listening()
        server.stop()
        #expect(server.status.listening == false)
        #expect(server.status.port == nil)
        await #expect(throws: (any Error).self) { _ = try await send(ping, to: port) }
    }
}
