import PulloverCore
import SwiftUI

struct InboxListView: View {
    var model: AppModel

    var body: some View {
        let sections = model.orderedSections
        let showEmptyState = model.snapshot.attentionCount == 0

        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    if showEmptyState {
                        EmptyStateView(
                            isError: model.snapshot.status == .error,
                            notice: model.snapshot.status == .ready ? model.snapshot.errorMessage : nil
                        )
                            .frame(minHeight: sections.isEmpty ? 480 : 260)
                    }
                    ForEach(Array(sections.enumerated()), id: \.element.category) { index, section in
                        if showEmptyState || index > 0 { Divider() }
                        InboxSection(model: model, category: section.category, items: section.items)
                    }
                }
            }
            .scrollIndicators(.automatic)
            .coordinateSpace(name: "list")
            .onAppear { model.ensureSelection() }
            .onChange(of: model.visibleItems.map(\.id)) { model.ensureSelection() }
            .onChange(of: model.scrollRequest) {
                guard let id = model.selectedID else { return }
                proxy.scrollTo(id)
            }
        }
    }
}

struct InboxSection: View {
    var model: AppModel
    var category: Category
    var items: [ClassifiedPullRequest]

    var body: some View {
        let open = !model.collapsed.contains(category)
        let compact = model.settings.layout == .compact

        Section {
            if open {
                // No spacing between rows: the stack line runs from row to
                // row, and any gap would break it.
                VStack(spacing: 0) {
                    ForEach(sectionRows(items)) { row in
                        PullRequestRow(model: model, row: row, compact: compact)
                            .id(row.id)
                    }
                }
                .padding(.horizontal, 8)
            }
        } header: {
            Button {
                model.toggleSection(category)
            } label: {
                HStack(spacing: 8) {
                    Text(category.title)
                        .font(.caption.weight(.semibold))
                    if compact {
                        Text(verbatim: "\(items.count)")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    } else {
                        Pill(text: "\(items.count)", minWidth: 18, capsule: true)
                    }
                    Spacer()
                    Image(systemName: open ? "chevron.down" : "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 15)
                }
                .padding(.top, 14)
                .padding(.bottom, 6)
                .padding(.horizontal, compact ? 16 : 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // The cards scroll under a pinned heading, so it needs a backdrop.
            .background(.background)
        }
        .padding(.bottom, open ? 8 : 0)
    }
}

struct EmptyStateView: View {
    var isError: Bool
    /// Why a fetch that succeeded is still incomplete — an organization whose
    /// pull requests GitHub withheld. Not "inbox zero": some of it is unseen.
    var notice: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: isError ? "icloud.slash" : notice != nil ? "eye.slash" : "checkmark")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(isError ? .red : notice != nil ? .orange : .green)
            Text(isError ? "Couldn't refresh" : notice != nil ? "Nothing visible waiting" : "Inbox zero")
                .font(.system(size: 13, weight: .semibold))
                .padding(.top, 14)
            Text(isError
                ? "What you see may be stale or incomplete."
                : notice.map { "Up to date for everything else, but \($0) — their pull requests aren't shown." }
                    ?? "Nothing waiting on you. Great job, buddy.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 3)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
