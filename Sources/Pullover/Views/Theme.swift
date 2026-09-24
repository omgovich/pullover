import PulloverCore
import SwiftUI

extension Accent {
    var color: Color {
        switch self {
        case .primary: .blue
        case .critical: .red
        case .positive: .green
        case .warning: .orange
        case .neutral: .secondary
        }
    }

    /// A translucent wash of the accent, for a badge with a fill and no border.
    /// A neutral fill would vanish on exactly the row the cursor tints.
    var tint: Color {
        color.opacity(0.14)
    }
}

enum Metrics {
    static let hairline = Color.primary.opacity(0.1)
    static let selection = Color.primary.opacity(0.07)
    static let faintFill = Color.primary.opacity(0.06)
    static let raised = Color.primary.opacity(0.025)
}

/// A small rounded count or keycap: a faint wash with secondary text.
struct Pill: View {
    var text: String
    var weight: Font.Weight = .semibold
    var minWidth: CGFloat = 0
    var capsule = false

    var body: some View {
        Text(text)
            .font(.caption.weight(weight))
            .monospacedDigit()
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .frame(minWidth: minWidth)
            .background(Metrics.faintFill, in: RoundedRectangle(cornerRadius: capsule ? 20 : 5, style: .continuous))
    }
}
