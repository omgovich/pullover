import Foundation

public struct HTTPRequest: Sendable, Equatable {
    public var method: String
    public var target: String
    /// Lowercased names; a repeated header keeps its last value.
    public var headers: [String: String]
    public var body: Data

    public init(method: String, target: String, headers: [String: String] = [:], body: Data = Data()) {
        self.method = method
        self.target = target
        self.headers = Dictionary(headers.map { ($0.key.lowercased(), $0.value) }, uniquingKeysWith: { _, last in last })
        self.body = body
    }

    public var path: String {
        URLComponents(string: target)?.path ?? target
    }
}

public struct HTTPResponse: Sendable, Equatable {
    public var status: Int
    public var headers: [String: String]
    public var body: Data

    public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }

    static func json(_ status: Int, _ value: JSONValue, headers: [String: String] = [:]) -> HTTPResponse {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let body = (try? encoder.encode(value)) ?? Data()
        return HTTPResponse(status: status, headers: headers.merging(["Content-Type": "application/json"]) { a, _ in a }, body: body)
    }

    func serialized() -> Data {
        var head = "HTTP/1.1 \(status) \(Self.reason(status))\r\n"
        var headers = self.headers
        headers["Content-Length"] = String(body.count)
        headers["Connection"] = "close"
        for (name, value) in headers.sorted(by: { $0.key < $1.key }) {
            head += "\(name): \(value)\r\n"
        }
        head += "\r\n"
        return Data(head.utf8) + body
    }

    private static func reason(_ status: Int) -> String {
        switch status {
        case 200: "OK"
        case 202: "Accepted"
        case 400: "Bad Request"
        case 403: "Forbidden"
        case 404: "Not Found"
        case 405: "Method Not Allowed"
        case 413: "Content Too Large"
        case 503: "Service Unavailable"
        default: "Internal Server Error"
        }
    }
}

enum HTTPParseResult: Equatable {
    case incomplete
    case complete(HTTPRequest)
    case invalid(String)
    case tooLarge
}

/// The largest body accepted. A JSON-RPC call to one of three small tools
/// never comes near it; anything bigger is not a client of this server.
let maxRequestBody = 1 << 20

/// The largest request head accepted: the request line and headers, without
/// the blank line that ends them.
let maxRequestHead = 64 * 1024

/// Parses one HTTP/1.1 request from the start of `buffer`. Only what a local
/// MCP client sends is understood: a request line, headers, and a body sized
/// by `Content-Length`. Chunked uploads are refused.
func parseHTTPRequest(_ buffer: Data) -> HTTPParseResult {
    guard let headerEnd = buffer.firstRange(of: Data("\r\n\r\n".utf8)) else {
        return buffer.count > maxRequestHead ? .tooLarge : .incomplete
    }
    // An oversized head can arrive whole, in one read or across several, so
    // having found its end says nothing about its size.
    guard headerEnd.lowerBound - buffer.startIndex <= maxRequestHead else { return .tooLarge }
    guard let head = String(data: buffer[buffer.startIndex..<headerEnd.lowerBound], encoding: .utf8) else {
        return .invalid("Request head is not UTF-8")
    }
    var lines = head.components(separatedBy: "\r\n")
    let requestLine = lines.removeFirst().split(separator: " ", omittingEmptySubsequences: true)
    guard requestLine.count == 3, requestLine[2].hasPrefix("HTTP/1.") else { return .invalid("Malformed request line") }

    var headers: [String: String] = [:]
    for line in lines where !line.isEmpty {
        guard let colon = line.firstIndex(of: ":") else { return .invalid("Malformed header") }
        let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
        headers[name] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
    }
    if headers["transfer-encoding"] != nil { return .invalid("Chunked requests are not supported") }

    let length = headers["content-length"].flatMap(Int.init) ?? 0
    guard length >= 0 else { return .invalid("Bad Content-Length") }
    guard length <= maxRequestBody else { return .tooLarge }
    let bodyStart = headerEnd.upperBound
    guard buffer.count - (bodyStart - buffer.startIndex) >= length else { return .incomplete }

    return .complete(HTTPRequest(
        method: String(requestLine[0]),
        target: String(requestLine[1]),
        headers: headers,
        body: Data(buffer[bodyStart..<(bodyStart + length)])
    ))
}
