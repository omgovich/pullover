import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var model: AppModel!
    private var statusItem: StatusItemController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let path = ProcessInfo.processInfo.environment["PULLOVER_SNAPSHOT"] {
            Snapshot.run(to: path)
            return
        }
        model = AppModel()
        statusItem = StatusItemController(model: model)
        model.launch()
        // For screenshots: open the popup as if clicked.
        if ProcessInfo.processInfo.environment["PULLOVER_OPEN_ON_LAUNCH"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [statusItem] in statusItem?.toggle() }
        }
    }

    /// Frees the MCP port before the process goes, so a relaunch finds it free.
    func applicationWillTerminate(_ notification: Notification) {
        model?.willTerminate()
    }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    // A menu-bar app: no Dock icon, no entry in the app switcher.
    app.setActivationPolicy(.accessory)
    // `NSApplication.delegate` is weak, and ARC may end a local's lifetime at
    // its last use — so pin it until `run()` returns.
    withExtendedLifetime(delegate) { app.run() }
}
