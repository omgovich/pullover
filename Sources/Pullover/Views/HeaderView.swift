import PulloverCore
import SwiftUI

struct HeaderView: View {
    var model: AppModel

    var body: some View {
        let snapshot = model.snapshot
        let update = model.updater.state

        HStack(spacing: 10) {
            if snapshot.attentionCount > 0 {
                Text(verbatim: "\(snapshot.attentionCount)")
                    .font(.caption.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 26, minHeight: 24)
                    .padding(.horizontal, 2)
                    .background(Metrics.faintFill, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(headline(snapshot))
                    .font(.system(size: 13, weight: .semibold))
                Text(headerStatusText(snapshot, now: model.now))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .help(headerStatusText(snapshot, now: model.now))
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if update.status == .ready, let version = update.version {
                // The one coloured control in a row of neutral ones, so a
                // waiting update is noticeable without a banner.
                Button {
                    model.installUpdate()
                } label: {
                    Label("New version", systemImage: "arrow.down.to.line")
                        .font(.caption.weight(.medium))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.blue)
                .help("Pullover \(version) is out — open the release")
            }

            HeaderIconButton(systemImage: "arrow.clockwise", help: "Refresh — R", spinning: snapshot.status == .loading) {
                model.refresh()
            }
            HeaderIconButton(systemImage: "gearshape", help: "Settings") {
                model.showSettings = true
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .frame(height: 52)
        .background(Metrics.raised)
    }
}

/// "All clear" only when the list can be trusted to be complete: a zero after
/// a failed fetch, or with an organization's pull requests missing, is not one.
private func headline(_ snapshot: InboxSnapshot) -> String {
    if snapshot.attentionCount > 0 { return "waiting on you" }
    if snapshot.status == .error { return "Couldn't refresh" }
    if snapshot.errorMessage != nil { return "Nothing visible waiting" }
    return "All clear"
}

struct HeaderIconButton: View {
    var systemImage: String
    var help: String
    var spinning = false
    var action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            ZStack {
                if spinning {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: systemImage)
                        .font(.system(size: 14, weight: .medium))
                }
            }
            .frame(width: 32, height: 32)
            .background(hovering ? Metrics.faintFill : .clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .help(help)
        .accessibilityLabel(help)
        .onHover { hovering = $0 }
    }
}
