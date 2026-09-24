import PulloverCore
import PulloverKit
import SwiftUI

struct SettingsView: View {
    @Bindable var model: AppModel

    var body: some View {
        switch model.settingsPane {
        case .root: root
        case .repositories: RepositoriesPane(model: model)
        }
    }

    private var root: some View {
        let settings = model.settings
        let snapshot = model.snapshot

        return VStack(spacing: 0) {
            PaneHeader(back: "Inbox", title: "Settings") { model.showSettings = false }
            Divider()

            ScrollView {
                VStack(spacing: 12) {
                    SettingsGroup {
                        SettingRow(
                            label: "Repositories",
                            value: repositorySummary(
                                watchAll: settings.watchAllRepositories,
                                known: snapshot.knownRepositories,
                                selected: settings.repositories
                            ),
                            onTap: { model.settingsPane = .repositories }
                        )
                    }

                    SettingsGroup {
                        SettingRow(label: "Refresh every") {
                            Picker("Refresh every", selection: binding(\.pollIntervalMinutes)) {
                                ForEach(Settings.pollIntervalOptions, id: \.self) { Text(verbatim: "\($0) min").tag($0) }
                            }
                        }
                        Divider().padding(.leading, 12)
                        SettingRow(label: "Appearance") {
                            Picker("Appearance", selection: binding(\.theme)) {
                                ForEach(ThemePreference.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                        }
                        Divider().padding(.leading, 12)
                        SettingRow(label: "Layout") {
                            Picker("Layout", selection: binding(\.layout)) {
                                ForEach(Layout.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                        }
                        Divider().padding(.leading, 12)
                        SettingRow(
                            label: "Open with a shortcut",
                            problem: settings.globalShortcut != nil && !model.shortcutActive
                                ? "Another app already uses this shortcut — pick a different one."
                                : nil
                        ) {
                            Picker("Open with a shortcut", selection: binding(\.globalShortcut)) {
                                Text("Off").tag(GlobalShortcut?.none)
                                ForEach(GlobalShortcut.allCases, id: \.self) { Text($0.label).tag(GlobalShortcut?.some($0)) }
                            }
                        }
                        Divider().padding(.leading, 12)
                        SettingRow(
                            label: "Start at login",
                            description: "Pullover is a menu-bar app — it opens nothing on screen.",
                            problem: model.launchAtLogin == .requiresApproval
                                ? "macOS is waiting for you to allow Pullover in Login Items."
                                : nil
                        ) {
                            if model.launchAtLogin == .requiresApproval {
                                Button("Open Login Items") { LoginItem.openSystemSettings() }
                                    .controlSize(.small)
                            }
                            Toggle("Start at login", isOn: Binding(
                                get: { model.launchAtLogin != .off },
                                set: { model.setLaunchAtLogin($0) }
                            ))
                            .toggleStyle(.switch)
                            .controlSize(.small)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()

                    SettingsGroup {
                        McpSection(model: model)
                    }

                    AccountRow(model: model)
                }
                .padding(12)
            }

            Divider()
            footer
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 0) {
                    Text(verbatim: "Pullover \(AppConfig.version) · MIT · ")
                    Link("Source", destination: AppConfig.sourceURL)
                }
                HStack(spacing: 0) {
                    Text("Built by ")
                    Link("Vlad Shilov", destination: AppConfig.authorURL)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .tint(.secondary)
            Spacer()
            Link(destination: AppConfig.sponsorURL) {
                Label("Sponsor", systemImage: "heart")
                    .font(.caption.weight(.medium))
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .tint(.green)
            .help("Support Pullover on GitHub Sponsors")
        }
        .padding(12)
        .background(Metrics.raised)
    }

    private func binding<T>(_ keyPath: WritableKeyPath<Settings, T>) -> Binding<T> {
        Binding(
            get: { model.settings[keyPath: keyPath] },
            set: { value in model.updateSettings { $0[keyPath: keyPath] = value } }
        )
    }
}

struct AccountRow: View {
    var model: AppModel

    var body: some View {
        let login = model.snapshot.myLogin
        HStack(spacing: 12) {
            // `myLogin` lands with the first fetch; the glyph stands in until then.
            ZStack {
                Circle().fill(Accent.primary.tint)
                if let login {
                    Text(initials(of: login)).font(.system(size: 14, weight: .semibold)).foregroundStyle(.blue)
                } else {
                    Image(systemName: "person.fill").foregroundStyle(.blue)
                }
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 1) {
                Text(login ?? "Signed in").font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text("Signed in with GitHub").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Sign out", role: .destructive) { model.signOut() }
                .controlSize(.small)
                .foregroundStyle(.red)
        }
        .padding(.horizontal, 4)
    }
}

struct McpSection: View {
    var model: AppModel

    var body: some View {
        let enabled = model.settings.mcpServerEnabled
        let status = model.mcpStatus

        VStack(alignment: .leading, spacing: 0) {
            SettingRow(label: "MCP server", description: "Lets Claude and other local agents read this inbox.", badge: enabled ? badge(status) : nil) {
                Toggle("MCP server", isOn: Binding(
                    get: { enabled },
                    set: { value in model.updateSettings { $0.mcpServerEnabled = value } }
                ))
                .toggleStyle(.switch)
                .controlSize(.small)
                .labelsHidden()
            }
            if enabled {
                detail(status)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
            }
        }
    }

    /// Whether the server is actually up, which is not what the switch says:
    /// the setting stays on when the port is taken.
    private func badge(_ status: MCPServerStatus) -> AnyView {
        let (text, color): (String, Color) = if status.error != nil {
            ("Not running", .red)
        } else if !status.listening {
            ("Starting…", .secondary)
        } else {
            ("Running", .green)
        }
        return AnyView(
            Text(text)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(color)
                .padding(.horizontal, 6)
                .padding(.vertical, 1)
                .background(color.opacity(0.14), in: Capsule())
        )
    }

    @ViewBuilder
    private func detail(_ status: MCPServerStatus) -> some View {
        if let error = status.error {
            Text(error).font(.caption).foregroundStyle(.red)
        } else if status.listening {
            HStack(spacing: 8) {
                // Monospaced: it is read character by character and typed
                // into another program's config.
                Text(model.mcpURLString)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .lineLimit(1)
                Spacer()
                Link(destination: AppConfig.mcpSetupURL) {
                    HStack(spacing: 3) {
                        Text("Setup instructions")
                        Image(systemName: "arrow.up.right.square")
                    }
                    .font(.caption.weight(.medium))
                }
                .help(AppConfig.mcpSetupURL.absoluteString)
            }
        }
    }
}

struct RepositoriesPane: View {
    @Bindable var model: AppModel
    @State private var filter = ""

    var body: some View {
        let settings = model.settings
        let options = repositoryOptions(known: model.snapshot.knownRepositories, selected: settings.repositories)
        let needle = filter.trimmingCharacters(in: .whitespaces).lowercased()
        let visible = needle.isEmpty ? options : options.filter { $0.lowercased().contains(needle) }
        // Folded like the store folds them: an older build may have saved mixed case.
        let ticked = Set(settings.repositories.map { $0.lowercased() })
        let selectedCount = options.filter { ticked.contains($0.lowercased()) }.count

        VStack(spacing: 0) {
            PaneHeader(back: "Settings", title: "Repositories") { model.settingsPane = .root }
            Divider()

            VStack(alignment: .leading, spacing: 12) {
                SettingsGroup {
                    SettingRow(label: "Watch all", description: "Every repository you are involved in, now and later.") {
                        Toggle("Watch all repositories", isOn: Binding(
                            get: { settings.watchAllRepositories },
                            set: { value in model.updateSettings { $0.watchAllRepositories = value } }
                        ))
                        .toggleStyle(.switch)
                        .controlSize(.small)
                        .labelsHidden()
                    }
                }

                // Nothing to narrow while every repository is watched.
                if !settings.watchAllRepositories {
                    if options.isEmpty {
                        Text("Nothing in your inbox yet, so there's nothing to narrow.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        SettingsGroup {
                            HStack(spacing: 6) {
                                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                                TextField("Filter repositories", text: $filter)
                                    .textFieldStyle(.plain)
                                Text(verbatim: "\(selectedCount)/\(options.count)")
                                    .font(.caption)
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                            }
                            .padding(10)
                            Divider()
                            ScrollView {
                                VStack(alignment: .leading, spacing: 8) {
                                    if visible.isEmpty {
                                        Text(verbatim: "No repository matches “\(filter.trimmingCharacters(in: .whitespaces))”.")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    ForEach(visible, id: \.self) { repo in
                                        Toggle(isOn: Binding(
                                            get: { ticked.contains(repo.lowercased()) },
                                            set: { model.setRepository(repo, watched: $0) }
                                        )) {
                                            RepositoryName(fullName: repo)
                                        }
                                        .toggleStyle(.checkbox)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                            }
                        }
                        .frame(maxHeight: .infinity, alignment: .top)

                        if let error = model.repositoryError {
                            Text(error).font(.caption).foregroundStyle(.red)
                        }
                        if selectedCount == 0 {
                            Text("Nothing ticked, so nothing shows. Tick the repos you care about.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(12)
        }
    }
}

/// The owner is the same for most rows, so it recedes and the repo name carries the row.
struct RepositoryName: View {
    var fullName: String

    var body: some View {
        if let slash = fullName.firstIndex(of: "/") {
            Text(fullName[...slash]).foregroundStyle(.secondary) + Text(fullName[fullName.index(after: slash)...])
        } else {
            Text(fullName)
        }
    }
}

struct PaneHeader: View {
    var back: String
    var title: String
    var onBack: () -> Void

    var body: some View {
        ZStack {
            Text(title).font(.system(size: 13, weight: .semibold))
            HStack {
                Button(action: onBack) {
                    HStack(spacing: 2) {
                        Image(systemName: "chevron.left").font(.system(size: 12, weight: .semibold))
                        Text(back)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.blue)
                Spacer()
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 52)
        .background(Metrics.raised)
    }
}

struct SettingsGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .background(Metrics.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Metrics.hairline))
    }
}

struct SettingRow<Control: View>: View {
    var label: String
    var description: String?
    var problem: String?
    var value: String?
    var badge: AnyView?
    @ViewBuilder var control: Control
    var onTap: (() -> Void)?

    init(
        label: String,
        description: String? = nil,
        problem: String? = nil,
        value: String? = nil,
        badge: AnyView? = nil,
        @ViewBuilder control: () -> Control = { EmptyView() },
        onTap: (() -> Void)? = nil
    ) {
        self.label = label
        self.description = description
        self.problem = problem
        self.value = value
        self.badge = badge
        self.onTap = onTap
        self.control = control()
    }

    var body: some View {
        let row = HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(label).font(.system(size: 13))
                    badge
                }
                if let description {
                    Text(description).font(.caption).foregroundStyle(.secondary)
                }
                if let problem {
                    Text(problem).font(.caption).foregroundStyle(.red)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let value {
                Text(value).font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
            control
            if onTap != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .contentShape(Rectangle())

        if let onTap {
            Button(action: onTap) { row }.buttonStyle(.plain)
        } else {
            row
        }
    }
}
