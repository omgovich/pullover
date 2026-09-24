import Foundation

/// What differs between a packaged build and one run straight from `swift run`.
enum AppConfig {
    /// Running from inside an `.app` bundle rather than a bare executable.
    static let isPackaged = Bundle.main.bundleURL.pathExtension == "app"

    /// A dev run gets its own name, so it never shares the installed app's
    /// settings or Keychain item.
    static let appName = isPackaged ? "Pullover" : "Pullover Dev"

    static let version =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0-dev"

    /// Two ports for the same reason as two names: a dev build next to an
    /// installed one must not fight it for the socket.
    static let mcpPort = isPackaged ? 7855 : 7856

    /// Baked into Info.plist at bundle time; the environment wins so a dev run
    /// can use its own OAuth App.
    static var githubClientID: String? {
        let fromEnvironment = ProcessInfo.processInfo.environment["PULLOVER_GITHUB_CLIENT_ID"]
        let fromBundle = Bundle.main.object(forInfoDictionaryKey: "PulloverGitHubClientID") as? String
        return [fromEnvironment, fromBundle].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty }
    }

    /// Where new releases are looked for, as `owner/repo`; nil turns the check
    /// off. Set at bundle time, since only the publisher knows which repository
    /// its releases — and version numbers — come from.
    static let updateRepository: String? = {
        let value = Bundle.main.object(forInfoDictionaryKey: "PulloverUpdateRepository") as? String
        return value?.isEmpty == false ? value : nil
    }()

    static var defaults: UserDefaults {
        isPackaged ? .standard : UserDefaults(suiteName: "Pullover.dev") ?? .standard
    }

    static let sourceURL = URL(string: "https://github.com/omgovich/pullover")!
    static let authorURL = URL(string: "https://omgovich.ru/")!
    static let sponsorURL = URL(string: "https://github.com/sponsors/omgovich")!
    static let mcpSetupURL = URL(string: "https://github.com/omgovich/pullover/blob/main/MCP.md")!
}
