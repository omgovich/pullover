import Foundation

/// `repo` and `read:org` are the narrowest scopes that can still see pull
/// requests in private repositories and review requests that arrived through a team.
public let githubScopes = "repo read:org"

public struct DeviceCode: Sendable, Equatable {
    public var userCode: String
    public var verificationURI: String
    public var deviceCode: String
    /// Seconds GitHub asks us to wait between polls.
    public var interval: Int
    public var expiresIn: Int
}

public enum DeviceFlowError: Error, LocalizedError, Equatable {
    case github(String)
    case expired
    case incomplete
    case http(Int)

    public var errorDescription: String? {
        switch self {
        case let .github(message): message
        case .expired: "That code expired. Sign in again."
        case .incomplete: "GitHub sent back an incomplete device code response"
        case let .http(status): "GitHub returned \(status) during sign-in"
        }
    }
}

/// Posts a form as JSON and returns the JSON response body.
public protocol HTTPPoster: Sendable {
    func postJSON(_ url: URL, body: [String: String]) async throws -> Data
}

public struct URLSessionPoster: HTTPPoster {
    public init() {}

    public func postJSON(_ url: URL, body: [String: String]) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw DeviceFlowError.http(http.statusCode)
        }
        return data
    }
}

/// GitHub's OAuth Device Flow: no redirect URI, no client secret — the user
/// types a short code into github.com and the app polls until they approve.
public struct DeviceFlow: Sendable {
    static let deviceCodeURL = URL(string: "https://github.com/login/device/code")!
    static let accessTokenURL = URL(string: "https://github.com/login/oauth/access_token")!

    private struct CodeResponse: Decodable {
        var device_code: String?
        var user_code: String?
        var verification_uri: String?
        var interval: Int?
        var expires_in: Int?
        var error: String?
        var error_description: String?
    }

    private struct TokenResponse: Decodable {
        var access_token: String?
        var error: String?
        var error_description: String?
    }

    public let clientID: String
    private let poster: any HTTPPoster
    private let sleep: @Sendable (Duration) async throws -> Void

    public init(
        clientID: String,
        poster: any HTTPPoster = URLSessionPoster(),
        sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) {
        self.clientID = clientID
        self.poster = poster
        self.sleep = sleep
    }

    private static func describe(_ error: String, _ description: String?) -> String {
        description.map { "\(error): \($0)" } ?? error
    }

    public func requestCode() async throws -> DeviceCode {
        let data = try await poster.postJSON(Self.deviceCodeURL, body: ["client_id": clientID, "scope": githubScopes])
        let response = try JSONDecoder().decode(CodeResponse.self, from: data)
        if let error = response.error {
            throw DeviceFlowError.github(Self.describe(error, response.error_description))
        }
        guard let deviceCode = response.device_code, let userCode = response.user_code,
              let uri = response.verification_uri else { throw DeviceFlowError.incomplete }
        return DeviceCode(
            userCode: userCode,
            verificationURI: uri,
            deviceCode: deviceCode,
            interval: response.interval ?? 5,
            expiresIn: response.expires_in ?? 900
        )
    }

    /// Polls until the user approves the device in their browser. Returns the
    /// access token, or throws if they deny it or the code expires.
    public func pollForToken(_ code: DeviceCode) async throws -> String {
        var interval = code.interval
        var elapsed = 0

        while true {
            try await sleep(.seconds(interval))
            elapsed += interval
            if elapsed >= code.expiresIn { throw DeviceFlowError.expired }

            let data = try await poster.postJSON(Self.accessTokenURL, body: [
                "client_id": clientID,
                "device_code": code.deviceCode,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            ])
            let response = try JSONDecoder().decode(TokenResponse.self, from: data)
            if let token = response.access_token { return token }

            switch response.error {
            case "authorization_pending": continue
            case "slow_down": interval += 5
            default: throw DeviceFlowError.github(Self.describe(response.error ?? "unknown_error", response.error_description))
            }
        }
    }
}
