import Foundation
import Security
import Testing
@testable import PulloverKit

@Suite struct TokenStoreTests {
    @Test func inMemoryStoreForgetsTheTokenOnClear() throws {
        let store = InMemoryTokenStore(token: "abc")
        try store.clear()
        #expect(store.load() == nil)
    }

    // Nothing to delete is a successful sign-out, not a failure to report.
    @Test func keychainStoreTreatsAMissingItemAsCleared() throws {
        let store = KeychainTokenStore(service: "PulloverTests.\(UUID().uuidString)")
        try store.clear()
    }

    @Test func describesAFailedDeleteAsSuch() {
        let error = KeychainError(status: errSecAuthFailed, operation: .delete)
        #expect(error.localizedDescription.hasPrefix("Couldn't remove the token from the Keychain"))
    }
}
