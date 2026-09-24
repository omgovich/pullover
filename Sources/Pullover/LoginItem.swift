import os
import ServiceManagement

/// Whether macOS starts Pullover at login. Not a setting of ours: it lives in
/// the system's login items, so it is read back from there every time rather
/// than remembered — turning it off in System Settings must show here.
enum LoginItem {
    enum Status: Equatable {
        case off
        case on
        /// Registered, but macOS holds it until the user allows it under
        /// System Settings → General → Login Items.
        case requiresApproval
    }

    private static let log = Logger(subsystem: "Pullover", category: "login-item")

    static var status: Status {
        switch SMAppService.mainApp.status {
        case .enabled: .on
        case .requiresApproval: .requiresApproval
        default: .off
        }
    }

    /// Returns what the system now reports, not what was asked for.
    @discardableResult
    static func setEnabled(_ enabled: Bool) -> Status {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            log.error("couldn't change the login item: \(error.localizedDescription)")
        }
        return status
    }

    static func openSystemSettings() {
        SMAppService.openSystemSettingsLoginItems()
    }
}
