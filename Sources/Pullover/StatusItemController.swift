import AppKit
import PulloverCore
import PulloverKit
import SwiftUI

/// The menu-bar item and the popover hanging off it.
@MainActor
final class StatusItemController: NSObject, NSPopoverDelegate {
    private static let popoverSize = NSSize(width: 440, height: 620)

    private let model: AppModel
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let popover = NSPopover()
    private var hostingController: NSHostingController<RootView>!
    private var keyMonitor: Any?

    init(model: AppModel) {
        self.model = model
        super.init()

        if let button = statusItem.button {
            let image = NSImage(systemSymbolName: "arrow.triangle.pull", accessibilityDescription: "Pullover")
            // A template image, so macOS tints it for a light or dark menu bar
            // and inverts it while the item is highlighted.
            image?.isTemplate = true
            button.image = image
            button.imagePosition = .imageLeading
            button.toolTip = "Pullover"
            button.target = self
            button.action = #selector(statusItemClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        hostingController = NSHostingController(rootView: RootView(model: model))
        hostingController.sizingOptions = []
        hostingController.view.frame = NSRect(origin: .zero, size: Self.popoverSize)
        popover.contentViewController = hostingController
        popover.contentSize = Self.popoverSize
        popover.behavior = .transient
        popover.animates = false
        popover.delegate = self

        model.hidePopup = { [weak self] in self?.popover.performClose(nil) }
        model.togglePopup = { [weak self] in self?.toggle() }
        model.showRowMenu = { [weak self] item in self?.showMenu(for: item) }
        model.onSettingsChange = { [weak self] settings in self?.applyAppearance(settings.theme) }
        model.inbox.onChange = { [weak self] snapshot in self?.updateBadge(snapshot) }

        applyAppearance(model.settings.theme)
        updateBadge(model.inbox.snapshot)
    }

    private func updateBadge(_ snapshot: InboxSnapshot) {
        guard let button = statusItem.button else { return }
        let title = badgeTitle(count: snapshot.attentionCount)
        button.attributedTitle = NSAttributedString(
            string: title.isEmpty ? "" : " \(title)",
            attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)]
        )
    }

    private func applyAppearance(_ theme: ThemePreference) {
        switch theme {
        case .system: popover.appearance = nil
        case .light: popover.appearance = NSAppearance(named: .aqua)
        case .dark: popover.appearance = NSAppearance(named: .darkAqua)
        }
    }

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        if NSApp.currentEvent?.type == .rightMouseUp {
            showStatusMenu()
        } else {
            toggle()
        }
    }

    func toggle() {
        if popover.isShown {
            popover.performClose(nil)
        } else {
            show()
        }
    }

    private func show() {
        guard let button = statusItem.button else { return }
        model.popupWillOpen()
        NSApp.activate()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
        startKeyMonitor()
    }

    func popoverDidClose(_ notification: Notification) {
        stopKeyMonitor()
    }

    // MARK: - Keyboard

    private func startKeyMonitor() {
        stopKeyMonitor()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.popover.isShown, event.window === self.popover.contentViewController?.view.window else {
                return event
            }
            // Any modifier but Shift means a shortcut meant for something else.
            if !event.modifierFlags.intersection([.command, .control, .option]).isEmpty { return event }
            let isTyping = event.window?.firstResponder is NSTextView
            let handled = self.model.handleKey(
                keyCode: event.keyCode,
                characters: event.charactersIgnoringModifiers ?? "",
                isTyping: isTyping
            )
            return handled ? nil : event
        }
    }

    private func stopKeyMonitor() {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        keyMonitor = nil
    }

    // MARK: - Menus

    private func showStatusMenu() {
        let menu = NSMenu()
        let update = model.updater.state
        if update.status == .ready, let version = update.version {
            // Above the status line: it is the one entry here that is news.
            menu.addItem(ClosureMenuItem("Update to \(version)…") { [weak self] in self?.model.installUpdate() })
            menu.addItem(.separator())
        }
        let status = NSMenuItem(title: trayStatusLine(model.inbox.snapshot, now: Date()), action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        menu.addItem(.separator())

        // Clickable mid-refresh too: a click then only queues one follow-up pass.
        let signedOut = model.inbox.snapshot.status == .signedOut
        let refresh = ClosureMenuItem(signedOut ? "Sign in to refresh" : "Refresh now") { [weak self] in self?.model.refresh() }
        refresh.isEnabled = !signedOut
        menu.addItem(refresh)
        menu.addItem(.separator())
        menu.addItem(ClosureMenuItem("Quit Pullover", key: "q") { NSApp.terminate(nil) })

        menu.autoenablesItems = false
        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    /// The row menu, hung off the selected row — what the M key opens.
    private func showMenu(for item: ClassifiedPullRequest) {
        guard let view = hostingController?.view else { return }
        let menu = NSMenu()
        for entry in prMenuEntries(isSnoozed: item.isSnoozed) {
            switch entry {
            case .separator:
                menu.addItem(.separator())
            case let .item(label, action):
                menu.addItem(ClosureMenuItem(label) { [weak self] in self?.model.perform(action, on: item) })
            }
        }
        // A row the lazy list hasn't laid out has no frame; hang the menu under
        // the header instead of in a corner.
        let frame = RowFrames.shared.frames[item.id] ?? CGRect(x: 0, y: 52, width: 0, height: 0)
        // SwiftUI's global space is the hosting view's, which is flipped.
        let point = view.isFlipped
            ? NSPoint(x: frame.minX + 16, y: frame.maxY)
            : NSPoint(x: frame.minX + 16, y: view.bounds.height - frame.maxY)
        menu.popUp(positioning: nil, at: point, in: view)
    }
}

/// An `NSMenuItem` that runs a closure, so menus can be built inline.
final class ClosureMenuItem: NSMenuItem {
    private let handler: () -> Void

    init(_ title: String, key: String = "", handler: @escaping () -> Void) {
        self.handler = handler
        super.init(title: title, action: #selector(run), keyEquivalent: key)
        target = self
    }

    @available(*, unavailable)
    required init(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    @objc private func run() { handler() }
}

/// Where each row sits in the popup, for hanging a menu off it. Not observed:
/// nothing redraws when a row moves.
@MainActor
final class RowFrames {
    static let shared = RowFrames()
    var frames: [String: CGRect] = [:]
}
