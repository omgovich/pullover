import Foundation

/// What agents see of a pull request through the MCP server.
public struct AgentPullRequestSummary: Encodable, Sendable, Equatable {
    public struct Stack: Encodable, Sendable, Equatable { public var index: Int; public var total: Int }
    public struct Branch: Encodable, Sendable, Equatable { public var head: String; public var base: String }
    public struct Size: Encodable, Sendable, Equatable { public var additions: Int; public var deletions: Int }

    public var repository: String
    public var number: Int
    public var title: String
    public var url: String
    public var author: String
    public var category: Category
    public var reason: String
    public var waitingSince: Date?
    public var isSnoozed: Bool
    public var stack: Stack?
    public var branch: Branch
    public var isDraft: Bool
    public var ci: CIStatus
    public var reviewDecision: ReviewDecision?
    public var mergeable: MergeableState
    public var size: Size
    public var updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case repository, number, title, url, author, category, reason, waitingSince, isSnoozed, stack, branch,
             isDraft, ci, reviewDecision, mergeable, size, updatedAt
    }

    // Written out so absent values read as an explicit `null` to an agent,
    // rather than as a key that is simply missing.
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(repository, forKey: .repository)
        try c.encode(number, forKey: .number)
        try c.encode(title, forKey: .title)
        try c.encode(url, forKey: .url)
        try c.encode(author, forKey: .author)
        try c.encode(category, forKey: .category)
        try c.encode(reason, forKey: .reason)
        try c.encode(waitingSince, forKey: .waitingSince)
        try c.encode(isSnoozed, forKey: .isSnoozed)
        try c.encode(stack, forKey: .stack)
        try c.encode(branch, forKey: .branch)
        try c.encode(isDraft, forKey: .isDraft)
        try c.encode(ci, forKey: .ci)
        try c.encode(reviewDecision, forKey: .reviewDecision)
        try c.encode(mergeable, forKey: .mergeable)
        try c.encode(size, forKey: .size)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct AgentInboxSection: Encodable, Sendable, Equatable {
    public var category: Category
    public var title: String
    public var pullRequests: [AgentPullRequestSummary]
}

public struct AgentInbox: Encodable, Sendable, Equatable {
    public var status: InboxSnapshot.Status
    /// One sentence worth relaying when the list may not be what it seems; nil when it is.
    public var notice: String?
    public var lastUpdatedAt: Date?
    public var myLogin: String?
    public var attentionCount: Int
    public var sections: [AgentInboxSection]

    private enum CodingKeys: String, CodingKey {
        case status, notice, lastUpdatedAt, myLogin, attentionCount, sections
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(status, forKey: .status)
        try c.encode(notice, forKey: .notice)
        try c.encode(lastUpdatedAt, forKey: .lastUpdatedAt)
        try c.encode(myLogin, forKey: .myLogin)
        try c.encode(attentionCount, forKey: .attentionCount)
        try c.encode(sections, forKey: .sections)
    }
}

public func describePullRequest(_ item: ClassifiedPullRequest) -> AgentPullRequestSummary {
    let pr = item.pr
    return AgentPullRequestSummary(
        repository: pr.repository,
        number: pr.number,
        title: pr.title,
        url: pr.url,
        author: pr.authorLogin,
        category: item.category,
        reason: item.reason,
        waitingSince: item.waitingSince,
        isSnoozed: item.isSnoozed,
        stack: item.stack.map { .init(index: $0.index, total: $0.total) },
        branch: .init(head: pr.headRefName, base: pr.baseRefName),
        isDraft: pr.isDraft,
        ci: pr.ciStatus,
        reviewDecision: pr.reviewDecision,
        mergeable: pr.mergeable,
        size: .init(additions: pr.additions, deletions: pr.deletions),
        updatedAt: pr.updatedAt
    )
}

private func notice(for snapshot: InboxSnapshot) -> String? {
    switch snapshot.status {
    case .signedOut:
        "Pullover is signed out. Sign in from its menu-bar window to see pull requests."
    case .error:
        snapshot.errorMessage
    case .loading:
        snapshot.lastUpdatedAt == nil
            ? "The first fetch is still running; there is nothing to show yet."
            : "A refresh is in progress; this is the last completed result."
    case .ready:
        // Usually nil. A restricted org is the exception: the list is real, but
        // a whole organization is missing from it — and an agent that isn't
        // told reads the gap as "no PRs".
        snapshot.errorMessage
    }
}

public func describeInbox(_ snapshot: InboxSnapshot, includeWaiting: Bool) -> AgentInbox {
    var sections: [AgentInboxSection] = []
    for category in Category.visible {
        if category == .waiting && !includeWaiting { continue }
        let inSection = snapshot.items.filter { $0.category == category }
        guard !inSection.isEmpty else { continue }
        // Ordered the way the window orders it, so a stack reads as the chain it is.
        sections.append(AgentInboxSection(
            category: category,
            title: category.title,
            pullRequests: orderSection(inSection).map(describePullRequest)
        ))
    }
    return AgentInbox(
        status: snapshot.status,
        notice: notice(for: snapshot),
        lastUpdatedAt: snapshot.lastUpdatedAt,
        myLogin: snapshot.myLogin,
        attentionCount: snapshot.attentionCount,
        sections: sections
    )
}
