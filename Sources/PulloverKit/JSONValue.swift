import Foundation

/// An arbitrary JSON value, for the few places — GraphQL variables, JSON-RPC —
/// where the shape is not known to the type system ahead of time.
///
/// A number written without a fraction or exponent that fits in 64 bits is
/// kept as `.integer`, so it survives a round trip exactly — a JSON-RPC id
/// above 2^53 must come back as sent, not rounded to the nearest `Double`.
/// The two number cases compare equal when they hold the same value.
public enum JSONValue: Hashable, Sendable, Codable {
    case null
    case bool(Bool)
    case integer(Int64)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let i = try? c.decode(Int64.self) { self = .integer(i) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case let .bool(b): try c.encode(b)
        case let .integer(i): try c.encode(i)
        case let .number(n):
            if n.rounded() == n, abs(n) < 1e15 { try c.encode(Int64(n)) } else { try c.encode(n) }
        case let .string(s): try c.encode(s)
        case let .array(a): try c.encode(a)
        case let .object(o): try c.encode(o)
        }
    }

    public subscript(key: String) -> JSONValue? {
        if case let .object(o) = self { return o[key] }
        return nil
    }

    public var stringValue: String? {
        if case let .string(s) = self { return s }
        return nil
    }

    public var boolValue: Bool? {
        if case let .bool(b) = self { return b }
        return nil
    }

    /// Any number, as a `Double`: an integer beyond 2^53 comes back rounded.
    public var numberValue: Double? {
        switch self {
        case let .integer(i): Double(i)
        case let .number(n): n
        default: nil
        }
    }

    /// The number exactly, or nil when it is not a whole number that fits in
    /// an `Int64` — so a caller never has to convert, or trap on, `1e20`.
    public var integerValue: Int64? {
        switch self {
        case let .integer(i): i
        case let .number(n): Int64(exactly: n)
        default: nil
        }
    }

    public var objectValue: [String: JSONValue]? {
        if case let .object(o) = self { return o }
        return nil
    }

    public static func == (lhs: JSONValue, rhs: JSONValue) -> Bool {
        switch (lhs, rhs) {
        case (.null, .null): true
        case let (.bool(a), .bool(b)): a == b
        case let (.integer(a), .integer(b)): a == b
        case let (.number(a), .number(b)): a == b
        case let (.integer(a), .number(b)), let (.number(b), .integer(a)): Int64(exactly: b) == a
        case let (.string(a), .string(b)): a == b
        case let (.array(a), .array(b)): a == b
        case let (.object(a), .object(b)): a == b
        default: false
        }
    }

    public func hash(into hasher: inout Hasher) {
        switch self {
        case .null: hasher.combine(0)
        case let .bool(b): hasher.combine(1); hasher.combine(b)
        // Hashed alike when they compare equal: a whole `Double` as its integer.
        case let .integer(i): hasher.combine(2); hasher.combine(i)
        case let .number(n):
            if let i = Int64(exactly: n) { hasher.combine(2); hasher.combine(i) } else { hasher.combine(3); hasher.combine(n) }
        case let .string(s): hasher.combine(4); hasher.combine(s)
        case let .array(a): hasher.combine(5); hasher.combine(a)
        case let .object(o): hasher.combine(6); hasher.combine(o)
        }
    }

    /// Round-trips any `Encodable` into a `JSONValue`.
    public static func from<T: Encodable>(_ value: T, encoder: JSONEncoder = JSONEncoder()) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: encoder.encode(value))
    }
}

extension JSONValue: ExpressibleByStringLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral,
    ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(integerLiteral value: Int64) { self = .integer(value) }
    public init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, JSONValue)...) {
        self = .object(Dictionary(elements, uniquingKeysWith: { _, last in last }))
    }
    public init(nilLiteral: ()) { self = .null }
}
