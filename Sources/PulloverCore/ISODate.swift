import Foundation

/// ISO 8601 in and out, with or without fractional seconds. GitHub sends whole
/// seconds; values Pullover wrote itself may carry milliseconds.
public enum ISODate {
    public static func parse(_ string: String) -> Date? {
        if let date = try? Date(string, strategy: .iso8601) { return date }
        return try? Date(string, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }

    /// Whole seconds by default, the shape GitHub uses and agents read.
    /// `fractionalSeconds` keeps milliseconds, for values Pullover reads back itself.
    public static func string(_ date: Date, fractionalSeconds: Bool = false) -> String {
        fractionalSeconds
            ? date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
            : date.formatted(.iso8601)
    }

    public static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = parse(raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Not an ISO 8601 date: \(raw)")
            }
            return date
        }
        return decoder
    }

    /// `fractionalSeconds` is for persistence: a snooze read back must wake at
    /// the instant it was set for, not up to a second early.
    public static func makeEncoder(pretty: Bool = false, fractionalSeconds: Bool = false) -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(string(date, fractionalSeconds: fractionalSeconds))
        }
        encoder.outputFormatting = pretty ? [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes] : [.sortedKeys, .withoutEscapingSlashes]
        return encoder
    }
}
