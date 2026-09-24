import Foundation
import Observation
import os

public struct UpdateState: Equatable, Sendable {
    public enum Status: Equatable, Sendable { case idle, ready }

    public var status: Status
    /// The version waiting to be installed; only set once `status` is `.ready`.
    public var version: String?
    /// Where to get it.
    public var url: URL?

    public static let idle = UpdateState(status: .idle, version: nil, url: nil)
}

/// Orders dotted version strings numerically, ignoring a leading `v` and any
/// pre-release suffix: "0.10.0" is newer than "0.9.3".
public func isNewerVersion(_ candidate: String, than current: String) -> Bool {
    func parts(_ version: String) -> [Int] {
        let core = version.trimmingCharacters(in: CharacterSet(charactersIn: "vV")).split(separator: "-").first ?? ""
        return core.split(separator: ".").map { Int($0) ?? 0 }
    }
    let a = parts(candidate), b = parts(current)
    for i in 0..<max(a.count, b.count) {
        let x = i < a.count ? a[i] : 0, y = i < b.count ? b[i] : 0
        if x != y { return x > y }
    }
    return false
}

/// Looks for a newer GitHub release now and then. The app has no notifications
/// by design, so a found release announces itself only inside the app — a line
/// in the status item's menu and a button in the window header.
@MainActor
@Observable
public final class UpdateChecker {
    private static let log = Logger(subsystem: "Pullover", category: "updater")

    /// The app runs for weeks at a time, so the interval is what actually
    /// delivers updates; the check at launch only catches the rare relaunch.
    static let checkInterval: Duration = .seconds(6 * 60 * 60)
    /// A moment after launch, so the first check never competes with the first fetch.
    static let firstCheckDelay: Duration = .seconds(30)

    public private(set) var state = UpdateState.idle

    @ObservationIgnored private let repository: String
    @ObservationIgnored private let currentVersion: String
    @ObservationIgnored private var task: Task<Void, Never>?

    /// `repository` is `owner/repo` on GitHub.
    public init(repository: String, currentVersion: String) {
        self.repository = repository
        self.currentVersion = currentVersion
    }

    public func start() {
        task?.cancel()
        task = Task { [weak self] in
            try? await Task.sleep(for: Self.firstCheckDelay)
            while !Task.isCancelled {
                await self?.check()
                try? await Task.sleep(for: Self.checkInterval)
            }
        }
    }

    private struct Release: Decodable {
        var tag_name: String
        var html_url: URL
        var draft: Bool
        var prerelease: Bool
    }

    /// A failed check is not worth surfacing: nobody asked for one, and the
    /// next is hours away at worst.
    public func check() async {
        guard state.status != .ready,
              let url = URL(string: "https://api.github.com/repos/\(repository)/releases/latest") else { return }
        var request = URLRequest(url: url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("Pullover", forHTTPHeaderField: "User-Agent")
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let release = try JSONDecoder().decode(Release.self, from: data)
            guard !release.draft, !release.prerelease, isNewerVersion(release.tag_name, than: currentVersion) else { return }
            let version = release.tag_name.trimmingCharacters(in: CharacterSet(charactersIn: "vV"))
            state = UpdateState(status: .ready, version: version, url: release.html_url)
        } catch {
            Self.log.info("update check failed: \(error.localizedDescription)")
        }
    }
}
