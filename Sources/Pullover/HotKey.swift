import Carbon.HIToolbox
import PulloverCore

/// The system-wide shortcut that opens the popup, through Carbon's hot-key API
/// — still the only public one that doesn't need Accessibility permission.
@MainActor
final class HotKey {
    private static let signature: OSType = 0x504C_5652 // 'PLVR'

    private var shortcut: GlobalShortcut?
    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?
    private let onTrigger: () -> Void

    init(onTrigger: @escaping () -> Void) {
        self.onTrigger = onTrigger
        installHandler()
    }

    private func installHandler() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, context in
            guard let context else { return noErr }
            let hotKey = Unmanaged<HotKey>.fromOpaque(context).takeUnretainedValue()
            MainActor.assumeIsolated { hotKey.onTrigger() }
            return noErr
        }, 1, &eventType, context, &handlerRef)
    }

    /// Registers `shortcut`, replacing the previous one. False when another app
    /// already holds the combination — macOS gives no way to find out which.
    @discardableResult
    func apply(_ shortcut: GlobalShortcut?) -> Bool {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        hotKeyRef = nil
        self.shortcut = shortcut
        guard let shortcut else { return false }

        let (keyCode, modifiers) = Self.keys(for: shortcut)
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(
            keyCode, modifiers, EventHotKeyID(signature: Self.signature, id: 1),
            GetApplicationEventTarget(), 0, &ref
        )
        guard status == noErr, let ref else { return false }
        hotKeyRef = ref
        return true
    }

    /// Re-checked rather than remembered: the app holding the combination may
    /// have quit since, and a cached failure would keep the key dead.
    var isActive: Bool {
        guard shortcut != nil else { return false }
        if hotKeyRef != nil { return true }
        return apply(shortcut)
    }

    private static func keys(for shortcut: GlobalShortcut) -> (UInt32, UInt32) {
        switch shortcut {
        case .controlOptionP: (UInt32(kVK_ANSI_P), UInt32(controlKey | optionKey))
        case .controlOptionR: (UInt32(kVK_ANSI_R), UInt32(controlKey | optionKey))
        case .controlCommandP: (UInt32(kVK_ANSI_P), UInt32(controlKey | cmdKey))
        }
    }
}
