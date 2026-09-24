import AppKit
import Observation
import PulloverCore
import PulloverKit

enum SignInState: Equatable {
    case idle
    case requesting
    case waitingForApproval(DeviceCode)
}

enum SettingsPane {
    case root, repositories
}

struct SnoozeToast: Equatable {
    var prId: String
    var number: Int
}

/// Owns the app's services and everything the popup shows. Views read from it
/// and call its actions; nothing below it knows about AppKit.
@MainActor
@Observable
final class AppModel {
    let inbox: Inbox
    let updater: UpdateChecker
    @ObservationIgnored let store: AppStore
    @ObservationIgnored private let tokenStore: any TokenStore
    @ObservationIgnored private var client: (any GraphQLClient)?
    @ObservationIgnored private var mcpServer: MCPServer!
    @ObservationIgnored private var hotKey: HotKey!
    @ObservationIgnored private var signInTask: Task<Void, Never>?
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored private var clockTask: Task<Void, Never>?

    /// Set by the popover controller.
    @ObservationIgnored var hidePopup: () -> Void = {}
    @ObservationIgnored var togglePopup: () -> Void = {}
    @ObservationIgnored var showRowMenu: (ClassifiedPullRequest) -> Void = { _ in }
    @ObservationIgnored var onSettingsChange: (Settings) -> Void = { _ in }

    private(set) var settings: Settings
    var showSettings = false
    var settingsPane = SettingsPane.root
    var collapsed: Set<Category> = [.waiting]
    private(set) var selectedID: String? {
        didSet {
            if let index = visibleItems.firstIndex(where: { $0.id == selectedID }) { selectedIndexHint = index }
        }
    }
    /// Where the cursor last sat, so it can stay in place when its row leaves.
    @ObservationIgnored private var selectedIndexHint = 0
    /// Bumped on a deliberate move — keys, a click — so the list scrolls to it.
    /// A hover moves the selection quietly and must not scroll under the pointer.
    private(set) var scrollRequest = 0
    private(set) var toast: SnoozeToast?
    /// Keeps the relative ages honest without re-fetching anything.
    private(set) var now = Date()
    private(set) var signIn = SignInState.idle
    private(set) var signInError: String?
    /// Set when sign-out could not remove the token from the Keychain.
    private(set) var signOutError: String?
    private(set) var launchAtLogin = LoginItem.status
    private(set) var shortcutActive = true
    private(set) var mcpStatus = MCPServerStatus.stopped
    var repositoryError: String?

    let mcpURLString = mcpURL(port: AppConfig.mcpPort)

    init() {
        let demo = DemoInbox.isEnabled
        // The demo starts from defaults every launch, so one run's toggles never leak into the next.
        if demo { UserDefaults.standard.removePersistentDomain(forName: "Pullover.demo") }
        let store = AppStore(defaults: demo ? UserDefaults(suiteName: "Pullover.demo")! : AppConfig.defaults)
        self.store = store
        self.settings = store.settings
        if demo {
            self.tokenStore = InMemoryTokenStore(token: "demo")
            self.inbox = Inbox(
                store: store,
                fetchPRs: { _, _ in FetchedPullRequests(prs: DemoInbox.pullRequests(now: Date())) },
                fetchLogin: { _ in DemoInbox.me }
            )
            DemoInbox.seedSnoozes(store, now: Date())
        } else {
            self.tokenStore = KeychainTokenStore(service: AppConfig.appName)
            self.inbox = Inbox(store: store)
        }
        self.updater = UpdateChecker(repository: AppConfig.updateRepository ?? "", currentVersion: AppConfig.version)

        inbox.clientProvider = { [unowned self] in client }
        inbox.onAuthError = { [unowned self] in signOut() }

        let tools = MCPTools(inbox: inbox, store: store, version: AppConfig.version)
        mcpServer = MCPServer { message in await tools.handle(message) }
        // Live, not a copy taken after the switch: a listener can fail later.
        mcpServer.onStatusChange = { [unowned self] status in mcpStatus = status }
        hotKey = HotKey { [unowned self] in togglePopup() }
    }

    func launch() {
        if DemoInbox.isEnabled {
            client = DemoInbox.Client()
            inbox.start()
        } else if let token = tokenStore.load() {
            client = URLSessionGraphQLClient(token: token)
            inbox.start()
        }
        shortcutActive = hotKey.apply(settings.globalShortcut)
        Task { await applyMCPSetting() }
        if AppConfig.isPackaged, AppConfig.updateRepository != nil { updater.start() }

        clockTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                self?.now = Date()
            }
        }
    }

    func willTerminate() {
        mcpServer.stop()
    }

    // MARK: - Popup lifecycle

    func popupWillOpen() {
        now = Date()
        launchAtLogin = LoginItem.status
        shortcutActive = hotKey.isActive
        // Opening onto a stale list is the one moment worth spending a fetch on.
        if client != nil, inbox.snapshot.shouldRefreshOnOpen(now: now) {
            refresh()
        }
        ensureSelection()
        scrollRequest += 1
    }

    // MARK: - Inbox

    var snapshot: InboxSnapshot { inbox.snapshot }

    /// Each section in the order it is drawn — stacks gathered into contiguous
    /// runs. Both the list and the keyboard cursor read from here, so they
    /// cannot disagree about where a row sits.
    var orderedSections: [(category: Category, items: [ClassifiedPullRequest])] {
        Category.visible.compactMap { category in
            let items = orderSection(snapshot.items.filter { $0.category == category })
            return items.isEmpty ? nil : (category, items)
        }
    }

    /// The order the keyboard cursor travels: visual order, skipping collapsed sections.
    var visibleItems: [ClassifiedPullRequest] {
        orderedSections.filter { !collapsed.contains($0.category) }.flatMap(\.items)
    }

    var selectedItem: ClassifiedPullRequest? {
        selectedID.flatMap { id in snapshot.items.first { $0.id == id } }
    }

    func refresh() {
        Task { await inbox.refresh() }
    }

    func toggleSection(_ category: Category) {
        if collapsed.contains(category) { collapsed.remove(category) } else { collapsed.insert(category) }
        ensureSelection()
    }

    // MARK: - Selection

    func pointAt(_ id: String) {
        selectedID = id
    }

    func select(_ id: String) {
        selectedID = id
        scrollRequest += 1
    }

    /// Keeps the cursor on a row that is shown: the first one as soon as there
    /// is one, so the keys work the moment the popup opens, and the row now in
    /// its place when its own row leaves — snoozed into a collapsed section, or
    /// collapsed itself. The keys act on the cursor, so it must never sit on a
    /// hidden row.
    func ensureSelection() {
        let items = visibleItems
        guard !items.contains(where: { $0.id == selectedID }) else { return }
        selectedID = selectedID == nil || items.isEmpty ? items.first?.id : items[min(selectedIndexHint, items.count - 1)].id
    }

    func moveSelection(by delta: Int) {
        let items = visibleItems
        guard !items.isEmpty else { return }
        let next: Int
        if let current = items.firstIndex(where: { $0.id == selectedID }) {
            next = (current + delta + items.count) % items.count
        } else {
            next = delta > 0 ? 0 : items.count - 1
        }
        select(items[next].id)
    }

    // MARK: - Pull request actions

    func open(_ item: ClassifiedPullRequest) {
        select(item.id)
        openURL(item.pr.url)
    }

    func openURL(_ string: String) {
        guard isSafeExternalURL(string), let url = URL(string: string) else { return }
        NSWorkspace.shared.open(url)
    }

    func perform(_ action: PRMenuAction, on item: ClassifiedPullRequest) {
        let pr = item.pr
        switch action {
        case .open: openURL(pr.url)
        case .openFiles: openURL("\(pr.url)/files")
        case .copyLink: copy(pr.url)
        case .copyBranch: copy(pr.headRefName)
        case .snoozeUntilActivity: snooze(item, type: .untilActivity)
        case .snooze4Hours: snooze(item, type: .untilTime, hours: 4)
        case .snoozeUntilTomorrow: snooze(item, type: .untilTime, hours: 24)
        case .unsnooze: unsnooze(pr.id)
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    func snooze(_ item: ClassifiedPullRequest, type: SnoozeType, hours: Int? = nil) {
        store.snooze(item.pr.id, type: type, now: Date(), hours: hours, headSHA: item.pr.headSHA)
        inbox.reclassify()
        showToast(for: item)
    }

    func unsnooze(_ prId: String) {
        store.unsnooze(prId)
        inbox.reclassify()
    }

    private func showToast(for item: ClassifiedPullRequest) {
        toast = SnoozeToast(prId: item.pr.id, number: item.pr.number)
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            self?.toast = nil
        }
    }

    func undoToast() {
        guard let toast else { return }
        unsnooze(toast.prId)
        toastTask?.cancel()
        self.toast = nil
    }

    // MARK: - Keyboard

    /// Handles a key pressed in the popup. Returns false to let it through —
    /// to a focused text field, say.
    func handleKey(keyCode: UInt16, characters: String, isTyping: Bool) -> Bool {
        // Esc closes the popup from anywhere, settings included.
        if keyCode == 53 {
            hidePopup()
            return true
        }
        guard !isTyping, !showSettings, snapshot.status != .signedOut else { return false }

        switch keyCode {
        case 125: moveSelection(by: 1); return true
        case 126: moveSelection(by: -1); return true
        case 36, 76:
            if let item = selectedItem { open(item) }
            return true
        default: break
        }

        switch characters.lowercased() {
        case "s":
            guard let item = selectedItem else { return true }
            // Straight to "until new activity": the key is for speed, not for
            // picking a duration. Still raises the toast so Undo works.
            if item.isSnoozed { unsnooze(item.id) } else { snooze(item, type: .untilActivity) }
            return true
        case "r":
            refresh()
            return true
        case "m":
            if let item = selectedItem { showRowMenu(item) }
            return true
        default:
            return false
        }
    }

    // MARK: - Settings

    func updateSettings(_ change: (inout Settings) -> Void) {
        let before = settings
        store.updateSettings(change)
        settings = store.settings

        if settings.pollIntervalMinutes != before.pollIntervalMinutes, client != nil { inbox.start() }
        if settings.watchAllRepositories != before.watchAllRepositories { inbox.reclassify() }
        if settings.globalShortcut != before.globalShortcut { shortcutActive = hotKey.apply(settings.globalShortcut) }
        if settings.mcpServerEnabled != before.mcpServerEnabled { Task { await applyMCPSetting() } }
        onSettingsChange(settings)
    }

    func setRepository(_ fullName: String, watched: Bool) {
        repositoryError = nil
        do {
            if watched { try store.addRepository(fullName) } else { store.removeRepository(fullName) }
        } catch {
            repositoryError = error.localizedDescription
        }
        settings = store.settings
        inbox.reclassify()
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        launchAtLogin = LoginItem.setEnabled(enabled)
    }

    private func applyMCPSetting() async {
        if settings.mcpServerEnabled {
            await mcpServer.start(port: AppConfig.mcpPort)
        } else {
            mcpServer.stop()
        }
        mcpStatus = mcpServer.status
    }

    // MARK: - Account

    var isSigningIn: Bool { signIn != .idle }

    /// A device-code sign-in stays in flight for up to the code's expiry. A
    /// second click while one runs does nothing: two cycles would overwrite
    /// each other's clipboard and race to save the token.
    func startSignIn() {
        guard signInTask == nil else { return }
        signInError = nil
        guard let clientID = AppConfig.githubClientID else {
            signInError = "No GitHub OAuth client ID. Set PULLOVER_GITHUB_CLIENT_ID — see the README."
            return
        }
        signIn = .requesting
        signInTask = Task {
            defer {
                signInTask = nil
                signIn = .idle
            }
            do {
                let flow = DeviceFlow(clientID: clientID)
                let code = try await flow.requestCode()
                signIn = .waitingForApproval(code)
                // The user has to type the code, so hand it to them on the clipboard too.
                copy(code.userCode)
                openURL(code.verificationURI)

                let token = try await flow.pollForToken(code)
                try tokenStore.save(token)
                client = URLSessionGraphQLClient(token: token)
                inbox.sessionDidChange()
                inbox.start()
            } catch is CancellationError {
                return
            } catch {
                signInError = error.localizedDescription
            }
        }
    }

    func signOut() {
        signInTask?.cancel()
        // Signed out of this run either way; a failed delete is reported
        // because the token would load again at the next launch.
        do {
            try tokenStore.clear()
            signOutError = nil
        } catch {
            signOutError = error.localizedDescription
        }
        client = nil
        inbox.sessionDidChange()
        inbox.stop()
        showSettings = false
        settingsPane = .root
        selectedID = nil
        refresh()
    }

    func installUpdate() {
        if let url = updater.state.url { NSWorkspace.shared.open(url) }
    }
}
