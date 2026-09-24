import Foundation

public enum ThemePreference: String, Codable, CaseIterable, Sendable {
    case system, light, dark

    public var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}

public enum Layout: String, Codable, CaseIterable, Sendable {
    case comfortable, compact

    public var label: String {
        switch self {
        case .comfortable: "Comfortable"
        case .compact: "Compact"
        }
    }
}

/// Combinations offered for the global shortcut.
///
/// A global shortcut takes its combination away from every app at once, so the
/// list avoids anything that types a character (⌥Space is a non-breaking
/// space, ⌥P is π) or that apps bind themselves (⇧⌘P is the command palette in
/// VS Code and friends). The pairs below do neither.
public enum GlobalShortcut: String, Codable, CaseIterable, Sendable {
    case controlOptionP = "Control+Alt+P"
    case controlOptionR = "Control+Alt+R"
    case controlCommandP = "Control+Command+P"

    public var label: String {
        switch self {
        case .controlOptionP: "⌃⌥P"
        case .controlOptionR: "⌃⌥R"
        case .controlCommandP: "⌃⌘P"
        }
    }
}

public struct Settings: Hashable, Codable, Sendable {
    public static let pollIntervalOptions = [1, 5, 15, 30]
    /// What a stored interval may be: at least a minute, at most a day. Anything
    /// outside — hand-edited or corrupt — falls back to the default, so the
    /// poller never multiplies a huge value into an overflow.
    public static let pollIntervalRange = 1...1440

    public var pollIntervalMinutes: Int
    public var repositories: [String]
    /// When true, search every repo the user is involved in and ignore `repositories`.
    public var watchAllRepositories: Bool
    public var theme: ThemePreference
    /// Opens the popup from anywhere, or nil for no shortcut.
    public var globalShortcut: GlobalShortcut?
    public var layout: Layout
    /// Whether the local MCP server should listen. Whether it actually does is
    /// what the server's status reports: a taken port leaves this on and the
    /// server off.
    public var mcpServerEnabled: Bool

    public init(
        pollIntervalMinutes: Int = 5,
        repositories: [String] = [],
        watchAllRepositories: Bool = true,
        theme: ThemePreference = .system,
        globalShortcut: GlobalShortcut? = .controlOptionP,
        layout: Layout = .comfortable,
        mcpServerEnabled: Bool = false
    ) {
        self.pollIntervalMinutes = pollIntervalMinutes
        self.repositories = repositories
        self.watchAllRepositories = watchAllRepositories
        self.theme = theme
        self.globalShortcut = globalShortcut
        self.layout = layout
        self.mcpServerEnabled = mcpServerEnabled
    }

    public static let defaults = Settings()

    private enum CodingKeys: String, CodingKey {
        case pollIntervalMinutes, repositories, watchAllRepositories, theme, globalShortcut, layout, mcpServerEnabled
    }

    /// Every field falls back to its default on its own: settings written before
    /// a field existed, or holding a value this build no longer offers, still
    /// load — a missing or unknown key never discards the ones next to it.
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Settings.defaults
        pollIntervalMinutes = (try? c.decode(Int.self, forKey: .pollIntervalMinutes)).flatMap { Settings.pollIntervalRange.contains($0) ? $0 : nil }
            ?? d.pollIntervalMinutes
        repositories = (try? c.decode([String].self, forKey: .repositories)) ?? d.repositories
        watchAllRepositories = (try? c.decode(Bool.self, forKey: .watchAllRepositories)) ?? d.watchAllRepositories
        theme = (try? c.decode(ThemePreference.self, forKey: .theme)) ?? d.theme
        layout = (try? c.decode(Layout.self, forKey: .layout)) ?? d.layout
        mcpServerEnabled = (try? c.decode(Bool.self, forKey: .mcpServerEnabled)) ?? d.mcpServerEnabled
        // An explicit null is "no shortcut" and must survive; only an absent or
        // unrecognised value falls back.
        if c.contains(.globalShortcut), (try? c.decodeNil(forKey: .globalShortcut)) == true {
            globalShortcut = nil
        } else {
            globalShortcut = (try? c.decode(GlobalShortcut.self, forKey: .globalShortcut)) ?? d.globalShortcut
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(pollIntervalMinutes, forKey: .pollIntervalMinutes)
        try c.encode(repositories, forKey: .repositories)
        try c.encode(watchAllRepositories, forKey: .watchAllRepositories)
        try c.encode(theme, forKey: .theme)
        if let globalShortcut {
            try c.encode(globalShortcut, forKey: .globalShortcut)
        } else {
            try c.encodeNil(forKey: .globalShortcut)
        }
        try c.encode(layout, forKey: .layout)
        try c.encode(mcpServerEnabled, forKey: .mcpServerEnabled)
    }
}
