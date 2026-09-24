import PulloverCore
import SwiftUI

struct RootView: View {
    @Bindable var model: AppModel

    var body: some View {
        // One frame for every state, so the popup's silhouette never changes
        // when signing in or opening settings.
        VStack(spacing: 0) {
            content
        }
        .frame(width: 440, height: 620)
        .overlay(alignment: .bottom) {
            if let toast = model.toast, !model.showSettings {
                ToastView(toast: toast) { model.undoToast() }
                    .padding(.bottom, 56)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.15), value: model.toast)
    }

    @ViewBuilder
    private var content: some View {
        let snapshot = model.snapshot
        if snapshot.status == .signedOut {
            SignInView(model: model)
        } else if model.showSettings {
            SettingsView(model: model)
        } else if snapshot.status == .loading && snapshot.items.isEmpty && snapshot.lastUpdatedAt == nil {
            ProgressView()
                .controlSize(.regular)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            HeaderView(model: model)
            Divider()
            InboxListView(model: model)
            Divider()
            HintsBar()
        }
    }
}

struct HintsBar: View {
    private let hints = [("↑↓", "Move"), ("⏎", "Review"), ("S", "Snooze"), ("R", "Refresh"), ("esc", "Close")]

    var body: some View {
        HStack(spacing: 14) {
            ForEach(hints, id: \.0) { key, label in
                HStack(spacing: 4) {
                    Pill(text: key, minWidth: 18)
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

struct ToastView: View {
    var toast: SnoozeToast
    var onUndo: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(verbatim: "#\(toast.number) snoozed")
                .font(.caption)
                .fixedSize()
            Button("Undo", action: onUndo)
                .controlSize(.small)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Metrics.hairline))
        .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
    }
}
