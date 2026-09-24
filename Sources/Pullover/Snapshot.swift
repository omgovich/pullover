import AppKit
import SwiftUI

/// Renders the popup offscreen to a PNG and quits: `PULLOVER_DEMO=1
/// PULLOVER_SNAPSHOT=out.png`, with `PULLOVER_SNAPSHOT_STATE` set to
/// `settings`, `repositories`, `compact` or `dark` for the other screens.
/// For documentation and for checking a layout change without a screen.
@MainActor
enum Snapshot {
    private static func fail(_ message: String) -> Never {
        FileHandle.standardError.write(Data("snapshot failed: \(message)\n".utf8))
        exit(1)
    }

    static func run(to path: String) {
        let state = ProcessInfo.processInfo.environment["PULLOVER_SNAPSHOT_STATE"] ?? ""
        let model = AppModel()
        model.launch()

        Task { @MainActor in
            await model.inbox.whenIdle()
            try? await Task.sleep(for: .seconds(2))
            if state.contains("compact") { model.updateSettings { $0.layout = .compact } }
            if state.contains("settings") { model.showSettings = true }
            if state.contains("repositories") {
                model.updateSettings { $0.watchAllRepositories = false }
                model.showSettings = true
                model.settingsPane = .repositories
            }
            model.popupWillOpen()

            // The popover paints the background behind the views; offscreen, nothing does.
            let view = NSHostingView(rootView: RootView(model: model).background(Color(nsColor: .windowBackgroundColor)))
            view.frame = NSRect(x: 0, y: 0, width: 440, height: 620)
            let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
            window.appearance = NSAppearance(named: state.contains("dark") ? .darkAqua : .aqua)
            window.backgroundColor = .windowBackgroundColor
            window.contentView = view
            window.orderFrontRegardless()

            // The rows ask for their avatars once drawn; wait for every one to
            // land (or fail) rather than guessing how long the network takes.
            try? await Task.sleep(for: .milliseconds(500))
            for _ in 0..<60 where !AvatarCache.shared.isIdle {
                try? await Task.sleep(for: .milliseconds(500))
            }
            guard AvatarCache.shared.isIdle else { fail("avatars were still loading after 30 seconds") }
            try? await Task.sleep(for: .milliseconds(500))

            view.layoutSubtreeIfNeeded()
            guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { fail("could not allocate a bitmap") }
            view.cacheDisplay(in: view.bounds, to: rep)
            guard let png = rep.representation(using: .png, properties: [:]) else { fail("could not encode a PNG") }
            do {
                try png.write(to: URL(fileURLWithPath: path))
            } catch {
                fail("could not write \(path): \(error.localizedDescription)")
            }
            exit(0)
        }
    }
}
