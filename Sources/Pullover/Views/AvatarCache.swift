import AppKit
import Observation

/// Author avatars, fetched once per URL and kept for the life of the app.
/// `AsyncImage` refetches whenever a row is recreated, and gives no way to
/// know when it has finished — which the snapshot renderer needs.
@MainActor
@Observable
final class AvatarCache {
    static let shared = AvatarCache()

    private(set) var images: [URL: NSImage] = [:]
    @ObservationIgnored private var loading: Set<URL> = []
    /// Not retried: a dead URL would otherwise be refetched on every redraw.
    @ObservationIgnored private var failed: Set<URL> = []

    var isIdle: Bool { loading.isEmpty }

    /// The image if it has arrived; otherwise starts fetching it and returns nil.
    func image(for url: URL) -> NSImage? {
        if let image = images[url] { return image }
        guard !loading.contains(url), !failed.contains(url) else { return nil }
        loading.insert(url)
        Task {
            let data = try? await URLSession.shared.data(from: url).0
            loading.remove(url)
            if let data, let image = NSImage(data: data) {
                images[url] = image
            } else {
                failed.insert(url)
            }
        }
        return nil
    }
}
