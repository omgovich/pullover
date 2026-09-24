import Foundation

/// Position of each pull request within its stack, keyed by PR id.
///
/// A stacked pull request targets the previous one's head branch, so the chain
/// is implied entirely by `headRefName`/`baseRefName`. Only open pull requests
/// are ever fetched, so a stack whose lower parts have merged reads as the
/// shorter remaining chain rooted at whatever is still open.
public func computeStackPositions(_ prs: [PullRequest]) -> [String: StackPosition] {
    var result: [String: StackPosition] = [:]

    // Branch names are only meaningful within their own repository, so a
    // coincidental match across repos must never link two unrelated PRs.
    let byRepo = Dictionary(grouping: prs, by: \.repository)

    for repoPRs in byRepo.values {
        let byId = Dictionary(repoPRs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        // Built permissively: a branch links its head-owner(s) to every PR based
        // on it, so a PR can get two parents (a shared `headRefName`) or two
        // children (a fork). The ambiguity is caught below by disqualifying the
        // whole connected component rather than guessed around.
        //
        // A PR from a fork is left out of the index: its `headRefName` names a
        // branch of the fork (often its `main`), not of this repository, so it
        // can't be what another PR here is based on. It can still be a child,
        // since its base branch does live here.
        let headIndex = Dictionary(grouping: repoPRs.filter { !$0.isCrossRepository }, by: \.headRefName)
        var parentsOf: [String: [String]] = [:]
        var childrenOf: [String: [String]] = [:]
        for pr in repoPRs {
            guard let parents = headIndex[pr.baseRefName] else { continue }
            parentsOf[pr.id] = parents.map(\.id)
            for parent in parents {
                childrenOf[parent.id, default: []].append(pr.id)
            }
        }

        var visited = Set<String>()
        for pr in repoPRs where !visited.contains(pr.id) {
            // Connected component, treated as undirected: a PR reachable only
            // through someone else's fork must still be poisoned by it.
            var component: [String] = []
            var queue = [pr.id]
            visited.insert(pr.id)
            while let id = queue.popLast() {
                component.append(id)
                for neighbour in (parentsOf[id] ?? []) + (childrenOf[id] ?? []) where !visited.contains(neighbour) {
                    visited.insert(neighbour)
                    queue.append(neighbour)
                }
            }

            // Only a simple chain qualifies. A number that might be wrong is
            // worse than no number, so one fork disqualifies every member.
            let isSimpleChain = component.allSatisfy {
                (parentsOf[$0]?.count ?? 0) <= 1 && (childrenOf[$0]?.count ?? 0) <= 1
            }
            guard isSimpleChain else { continue }

            // No root means the links form a cycle, which has no start to walk from.
            guard let root = component.first(where: { (parentsOf[$0]?.count ?? 0) == 0 }) else { continue }

            var chain: [PullRequest] = []
            var seen = Set<String>()
            var current: String? = root
            while let id = current, !seen.contains(id) {
                seen.insert(id)
                if let member = byId[id] { chain.append(member) }
                current = childrenOf[id]?.first
            }

            // A chain of one PR is an ordinary pull request, not a stack.
            guard chain.count >= 2 else { continue }
            for (i, member) in chain.enumerated() {
                result[member.id] = StackPosition(id: root, index: i + 1, total: chain.count)
            }
        }
    }

    return result
}

/// Reorders `items` so each stack's members sit together, in one contiguous
/// run, ascending by `index`; the incoming order is otherwise preserved.
///
/// A stack takes the position of its earliest-appearing member — under the
/// classifier's sort the one waiting longest — so a stack sinks no further
/// than its oldest obligation. Inside the run, chain order wins over waiting
/// time, because a chain drawn out of order isn't a chain.
public func orderSection(_ items: [ClassifiedPullRequest]) -> [ClassifiedPullRequest] {
    var groups: [String: [ClassifiedPullRequest]] = [:]
    for item in items {
        if let id = item.stack?.id { groups[id, default: []].append(item) }
    }
    for key in groups.keys {
        groups[key]?.sort { ($0.stack?.index ?? 0) < ($1.stack?.index ?? 0) }
    }

    var emitted = Set<String>()
    var result: [ClassifiedPullRequest] = []
    for item in items {
        guard let id = item.stack?.id else {
            result.append(item)
            continue
        }
        if emitted.insert(id).inserted {
            result += groups[id] ?? []
        }
    }
    return result
}

/// A pull request row, with the stack line it draws inside its own bounds.
public struct StackCardRow: Hashable, Sendable, Identifiable {
    public var item: ClassifiedPullRequest
    /// Line from the row's top edge down to the avatar.
    public var lineAbove: Bool
    /// Line from the avatar down to the row's bottom edge.
    public var lineBelow: Bool
    /// Whether that line spans members that aren't shown rather than joining
    /// the neighbouring row. Drawn dotted.
    public var gapAbove: Bool
    public var gapBelow: Bool
    /// Whether that segment has nothing to meet: no neighbouring row draws a
    /// line back towards it. Drawn as a fade rather than dots, which need a
    /// neighbour to land against to read as a break.
    public var gapAboveOpen: Bool
    public var gapBelowOpen: Bool

    public var id: String { item.id }
}

/// Lays a section out for rendering, from a list already arranged by
/// `orderSection`. A member draws its line upward unless it is the chain's
/// first and downward unless it is its last; that line is dotted where the
/// chain skips members between two shown rows, and faded where it carries on
/// past the list.
public func sectionRows(_ ordered: [ClassifiedPullRequest]) -> [StackCardRow] {
    func stack(at i: Int) -> StackPosition? {
        ordered.indices.contains(i) ? ordered[i].stack : nil
    }
    func adjoins(_ i: Int, _ s: StackPosition, _ index: Int) -> Bool {
        guard let other = stack(at: i) else { return false }
        return other.id == s.id && other.index == index
    }
    func sameChain(_ i: Int, _ s: StackPosition) -> Bool {
        stack(at: i)?.id == s.id
    }

    return ordered.enumerated().map { i, item in
        guard let s = item.stack else {
            return StackCardRow(
                item: item, lineAbove: false, lineBelow: false,
                gapAbove: false, gapBelow: false, gapAboveOpen: false, gapBelowOpen: false
            )
        }
        let gapAbove = s.index > 1 && !adjoins(i - 1, s, s.index - 1)
        let gapBelow = s.index < s.total && !adjoins(i + 1, s, s.index + 1)
        return StackCardRow(
            item: item,
            lineAbove: s.index > 1,
            lineBelow: s.index < s.total,
            gapAbove: gapAbove,
            gapBelow: gapBelow,
            gapAboveOpen: gapAbove && !sameChain(i - 1, s),
            gapBelowOpen: gapBelow && !sameChain(i + 1, s)
        )
    }
}
