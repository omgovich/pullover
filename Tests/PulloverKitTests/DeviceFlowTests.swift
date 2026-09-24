import Foundation
import Testing
@testable import PulloverKit

/// Answers each post from a script of JSON bodies, one per call (the last repeats).
private final class FakePoster: HTTPPoster, @unchecked Sendable {
    struct Call: Equatable {
        var url: URL
        var body: [String: String]
    }

    private let lock = NSLock()
    private let responses: [JSONValue]
    private var recorded: [Call] = []

    init(_ responses: JSONValue...) { self.responses = responses }

    var calls: [Call] { lock.withLock { recorded } }

    func postJSON(_ url: URL, body: [String: String]) async throws -> Data {
        let n = lock.withLock {
            recorded.append(Call(url: url, body: body))
            return recorded.count
        }
        return try encode(responses[min(n, responses.count) - 1])
    }
}

private final class SleepRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [Duration] = []

    var durations: [Duration] { lock.withLock { recorded } }
    var sleep: @Sendable (Duration) async throws -> Void { { [self] d in lock.withLock { recorded.append(d) } } }
}

private let code = DeviceCode(
    userCode: "ABCD-1234",
    verificationURI: "https://github.com/login/device",
    deviceCode: "device-code-value",
    interval: 5,
    expiresIn: 900
)

@Suite struct DeviceFlowRequestCodeTests {
    @Test func postsTheClientIdAndReturnsTheUserCode() async throws {
        let poster = FakePoster([
            "device_code": "device-code-value",
            "user_code": "ABCD-1234",
            "verification_uri": "https://github.com/login/device",
            "interval": 5,
            "expires_in": 900,
        ])

        let info = try await DeviceFlow(clientID: "client-123", poster: poster).requestCode()

        #expect(info == code)
        #expect(poster.calls == [FakePoster.Call(
            url: URL(string: "https://github.com/login/device/code")!,
            body: ["client_id": "client-123", "scope": "repo read:org"]
        )])
    }

    @Test func defaultsTheIntervalAndExpiryWhenGitHubLeavesThemOut() async throws {
        let poster = FakePoster(["device_code": "d", "user_code": "u", "verification_uri": "https://github.com/login/device"])
        let info = try await DeviceFlow(clientID: "client-123", poster: poster).requestCode()
        #expect(info.interval == 5)
        #expect(info.expiresIn == 900)
    }

    @Test func throwsWhenGitHubReportsAnError() async {
        let poster = FakePoster(["error": "unauthorized_client"])
        await #expect(throws: DeviceFlowError.github("unauthorized_client")) {
            try await DeviceFlow(clientID: "bad", poster: poster).requestCode()
        }
    }

    @Test func throwsWhenTheAnswerIsIncomplete() async {
        let poster = FakePoster(["device_code": "d"])
        await #expect(throws: DeviceFlowError.incomplete) {
            try await DeviceFlow(clientID: "client-123", poster: poster).requestCode()
        }
    }
}

@Suite struct DeviceFlowPollTests {
    @Test func returnsTheTokenOnceTheUserApproves() async throws {
        let poster = FakePoster(["error": "authorization_pending"], ["access_token": "gho_secret"])
        let sleeper = SleepRecorder()

        let token = try await DeviceFlow(clientID: "client-123", poster: poster, sleep: sleeper.sleep).pollForToken(code)

        #expect(token == "gho_secret")
        #expect(poster.calls.count == 2)
        #expect(sleeper.durations.first == .seconds(5))
        #expect(poster.calls.first == FakePoster.Call(
            url: URL(string: "https://github.com/login/oauth/access_token")!,
            body: [
                "client_id": "client-123",
                "device_code": "device-code-value",
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            ]
        ))
    }

    @Test func backsOffByFiveSecondsOnSlowDown() async throws {
        let poster = FakePoster(["error": "slow_down"], ["access_token": "gho_secret"])
        let sleeper = SleepRecorder()

        _ = try await DeviceFlow(clientID: "client-123", poster: poster, sleep: sleeper.sleep).pollForToken(code)

        #expect(sleeper.durations == [.seconds(5), .seconds(10)])
    }

    @Test func givesUpWhenTheUserDeniesTheRequest() async {
        let poster = FakePoster(["error": "access_denied"])
        let error = await #expect(throws: DeviceFlowError.self) {
            try await DeviceFlow(clientID: "client-123", poster: poster, sleep: { _ in }).pollForToken(code)
        }
        #expect(error?.localizedDescription.contains("access_denied") == true)
    }

    @Test func givesUpWhenTheDeviceCodeExpires() async {
        let poster = FakePoster(["error": "expired_token", "error_description": "The device code has expired."])
        await #expect(throws: DeviceFlowError.github("expired_token: The device code has expired.")) {
            try await DeviceFlow(clientID: "client-123", poster: poster, sleep: { _ in }).pollForToken(code)
        }
    }

    @Test func stopsPollingOnceTheAccumulatedWaitExceedsExpiresInEvenIfGitHubNeverSaysSo() async {
        let poster = FakePoster(["error": "authorization_pending"])
        var short = code
        short.expiresIn = 10

        await #expect(throws: DeviceFlowError.expired) {
            try await DeviceFlow(clientID: "client-123", poster: poster, sleep: { _ in }).pollForToken(short)
        }
        #expect(poster.calls.count == 1)
    }
}
