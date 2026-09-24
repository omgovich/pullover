import Foundation
import os
import Security

public protocol TokenStore: Sendable {
    func load() -> String?
    func save(_ token: String) throws
    /// Throws when the token may still be stored, so a failed sign-out is not
    /// mistaken for one that worked. Clearing an empty store succeeds.
    func clear() throws
}

public struct KeychainError: Error, LocalizedError {
    public enum Operation: Sendable { case save, delete }

    public var status: OSStatus
    public var operation: Operation = .save
    public var errorDescription: String? {
        let detail = SecCopyErrorMessageString(status, nil).map { $0 as String } ?? "OSStatus \(status)"
        switch operation {
        case .save: return "Couldn't save the token to the Keychain: \(detail)"
        case .delete: return "Couldn't remove the token from the Keychain: \(detail)"
        }
    }
}

/// The GitHub token, as a generic password in the login keychain.
public struct KeychainTokenStore: TokenStore {
    private static let log = Logger(subsystem: "Pullover", category: "keychain")

    public let service: String
    public let account: String

    public init(service: String, account: String = "github-token") {
        self.service = service
        self.account = account
    }

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    public func load() -> String? {
        var query = self.query
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
            Self.log.error("failed to read the token: \(status)")
            return nil
        }
        return token
    }

    public func save(_ token: String) throws {
        let data = Data(token.utf8)
        let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw KeychainError(status: update) }

        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    public func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError(status: status, operation: .delete)
        }
    }
}

/// For tests and previews.
public final class InMemoryTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var token: String?

    public init(token: String? = nil) { self.token = token }

    public func load() -> String? { lock.withLock { token } }
    public func save(_ token: String) throws { lock.withLock { self.token = token } }
    public func clear() throws { lock.withLock { token = nil } }
}
