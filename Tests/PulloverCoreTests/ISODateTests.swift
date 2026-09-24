import Foundation
import PulloverCore
import Testing

@Suite struct ISODateTests {
    private let date = ISODate.parse("2026-08-10T12:00:00Z")!.addingTimeInterval(0.25)

    @Test func writesWholeSecondsByDefault() {
        #expect(ISODate.string(date) == "2026-08-10T12:00:00Z")
    }

    @Test func keepsMillisecondsWhenAsked() {
        #expect(ISODate.string(date, fractionalSeconds: true) == "2026-08-10T12:00:00.250Z")
    }

    private struct Stamp: Codable, Equatable { var at: Date }

    @Test func encoderRoundTripsFractionalSecondsWhenAsked() throws {
        let data = try ISODate.makeEncoder(fractionalSeconds: true).encode(Stamp(at: date))
        #expect(try ISODate.makeDecoder().decode(Stamp.self, from: data) == Stamp(at: date))
    }

    @Test func encoderWritesWholeSecondsByDefault() throws {
        let data = try ISODate.makeEncoder().encode(Stamp(at: date))
        #expect(String(decoding: data, as: UTF8.self) == #"{"at":"2026-08-10T12:00:00Z"}"#)
    }
}
