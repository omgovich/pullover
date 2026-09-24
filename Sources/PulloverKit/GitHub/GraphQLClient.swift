import Foundation

/// Runs one GraphQL query and hands back the response's `data`, as JSON.
public protocol GraphQLClient: Sendable {
    func execute(_ query: String, variables: [String: JSONValue]) async throws -> Data
}

public struct URLSessionGraphQLClient: GraphQLClient {
    public static let endpoint = URL(string: "https://api.github.com/graphql")!

    private let token: String
    private let session: URLSession

    public init(token: String, session: URLSession = .shared) {
        self.token = token
        self.session = session
    }

    public func execute(_ query: String, variables: [String: JSONValue]) async throws -> Data {
        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.setValue("bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Pullover", forHTTPHeaderField: "User-Agent")
        request.httpBody = try JSONEncoder().encode(["query": JSONValue.string(query), "variables": .object(variables)])
        // GitHub terminates a query after ten seconds; anything slower than
        // this is the network, not GitHub thinking.
        request.timeoutInterval = 30

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            // A cancelled fetch is not a network failure: wrapped as one it
            // would read as transient and be asked again.
            if error.code == .cancelled || Task.isCancelled { throw CancellationError() }
            throw GitHubError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw GitHubError.malformed("GitHub sent back something that isn't an HTTP response")
        }
        return try Self.interpret(status: http.statusCode, headers: http.allHeaderFields, body: data)
    }

    /// Split out so the error handling can be tested without a network.
    static func interpret(status: Int, headers: [AnyHashable: Any], body: Data) throws -> Data {
        let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any]

        guard (200..<300).contains(status) else {
            var lowered: [String: String] = [:]
            for (key, value) in headers {
                if let key = key as? String { lowered[key.lowercased()] = "\(value)" }
            }
            let message = (json?["message"] as? String) ?? String(decoding: body, as: UTF8.self)
            throw GitHubError.http(status: status, message: message, headers: lowered)
        }
        guard let json else { throw GitHubError.malformed("GitHub answered with something that isn't JSON") }

        let payload = json["data"].flatMap { $0 is NSNull ? nil : $0 }
        let payloadData = try payload.map { try JSONSerialization.data(withJSONObject: $0, options: [.fragmentsAllowed]) }

        if let errors = json["errors"] as? [[String: Any]], !errors.isEmpty {
            let messages = errors.map { ($0["message"] as? String) ?? "Unknown GraphQL error" }
            throw GitHubError.graphql(messages: messages, partialData: payloadData)
        }
        guard let payloadData else { throw GitHubError.malformed("GitHub answered without any data") }
        return payloadData
    }
}
