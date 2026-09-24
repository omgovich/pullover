import Foundation

/// A pull request as `DETAILS_QUERY` returns it. Enums arrive as raw strings
/// and are interpreted in `mapPullRequest`, so a value GitHub adds later
/// degrades one field instead of failing the whole node.
public struct PullRequestNode: Decodable, Sendable {
    public struct Actor: Decodable, Sendable {
        public var login: String
        public var avatarUrl: String?
    }

    public struct CommentNode: Decodable, Sendable {
        public var author: Actor?
        public var createdAt: Date
        public var bodyText: String
    }

    public struct Connection<Node: Decodable & Sendable>: Decodable, Sendable {
        public var nodes: [Node?]
    }

    public struct ReviewNode: Decodable, Sendable {
        public var author: Actor?
        public var state: String
        /// Null for a review still pending, which is only ever the viewer's own.
        public var submittedAt: Date?
        public var bodyText: String?
        /// The commit the review was made against. Optional because GitHub
        /// returns null once that commit is gone, and so older fixtures decode.
        public var commit: CommitRef?

        public struct CommitRef: Decodable, Sendable { public var oid: String }
    }

    public struct ThreadNode: Decodable, Sendable {
        public var id: String
        public var isResolved: Bool
        public var comments: Connection<CommentNode>
    }

    public struct CommitNode: Decodable, Sendable {
        public struct Commit: Decodable, Sendable {
            public struct Rollup: Decodable, Sendable { public var state: String }
            /// Optional only so fixtures written before it was fetched still decode.
            public var oid: String?
            public var committedDate: Date
            public var statusCheckRollup: Rollup?
        }
        public var commit: Commit
    }

    public struct TimelineNode: Decodable, Sendable {
        public struct Reviewer: Decodable, Sendable { public var login: String? }
        public var __typename: String
        public var createdAt: Date?
        /// Only a `User` reviewer carries a login — a team or a bot has none.
        public var requestedReviewer: Reviewer?
    }

    public struct Repository: Decodable, Sendable { public var nameWithOwner: String }
    public struct AutoMerge: Decodable, Sendable {}

    public var id: String
    public var number: Int
    public var title: String
    public var url: String
    public var isDraft: Bool
    public var createdAt: Date
    public var updatedAt: Date
    public var additions: Int
    public var deletions: Int
    public var headRefName: String
    public var baseRefName: String
    /// Optional only so a payload predating the field still decodes; GitHub always sends it.
    public var isCrossRepository: Bool?
    public var reviewDecision: String?
    public var mergeable: String
    public var autoMergeRequest: AutoMerge?
    public var bodyText: String
    public var author: Actor?
    public var repository: Repository
    public var reviews: Connection<ReviewNode>
    public var reviewThreads: Connection<ThreadNode>
    public var comments: Connection<CommentNode>
    public var commits: Connection<CommitNode>
    public var timelineItems: Connection<TimelineNode>
}

/// Whether `text` @-mentions `login`, case-insensitively. GitHub logins allow
/// hyphens, which aren't word characters, so a plain `\b` would also match
/// `@vlad-2` for `vlad` — this requires no login-legal character either side.
public func mentionsUser(_ text: String, login: String) -> Bool {
    let pattern = "(?<![A-Za-z0-9-])@\(NSRegularExpression.escapedPattern(for: login))(?![A-Za-z0-9-])"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return false }
    return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
}

/// Login GitHub itself shows for an account that no longer exists.
let deletedUserLogin = "ghost"

/// A deleted account's comment comes back with a null `author` but still took
/// its turn in the conversation: dropping it would make the comment before it
/// read as the last word, and lose any mention it made. It stays, as "ghost".
private func flatten(_ nodes: [PullRequestNode.CommentNode?]) -> [ThreadComment] {
    nodes.compactMap { node in
        guard let node else { return nil }
        return ThreadComment(
            authorLogin: node.author?.login ?? deletedUserLogin,
            createdAt: node.createdAt,
            bodyText: node.bodyText
        )
    }
}

public func mapCIStatus(_ state: String?) -> CIStatus {
    switch state {
    case "SUCCESS": .success
    case "FAILURE", "ERROR": .failure
    case "PENDING", "EXPECTED": .pending
    default: .none
    }
}

private func computeMentionsAt(
    _ node: PullRequestNode,
    comments: [ThreadComment],
    reviews: [Review],
    myLogin: String
) -> [Date] {
    var candidates = comments
        .filter { $0.authorLogin != myLogin && mentionsUser($0.bodyText, login: myLogin) }
        .map(\.createdAt)
    // A mention can also be submitted as a review body ("@vlad take another look").
    candidates += reviews
        .filter { $0.authorLogin != myLogin && mentionsUser($0.bodyText, login: myLogin) }
        .map(\.submittedAt)
    if node.author?.login != myLogin && mentionsUser(node.bodyText, login: myLogin) {
        candidates.append(node.createdAt)
    }
    // Sorted, because the classifier reads both ends: the newest decides whether
    // a mention still stands, the oldest unanswered one since when.
    return candidates.sorted()
}

/// When the user was last asked to review, or nil. A request naming a teammate
/// must not restart this user's clock, so only requests naming them count —
/// falling back to one naming nobody, since a team or bot request is why
/// GitHub matched this PR at all.
private func computeReviewRequestedAt(_ node: PullRequestNode, myLogin: String) -> Date? {
    let requests = node.timelineItems.nodes.compactMap { $0 }.filter { $0.__typename == "ReviewRequestedEvent" }
    if let named = requests.filter({ $0.requestedReviewer?.login == myLogin }).compactMap(\.createdAt).max() {
        return named
    }
    return requests.filter { $0.requestedReviewer?.login == nil }.compactMap(\.createdAt).max()
}

private func computeReadyForReviewAt(_ node: PullRequestNode) -> Date? {
    node.timelineItems.nodes.compactMap { $0 }
        .filter { $0.__typename == "ReadyForReviewEvent" }
        .compactMap(\.createdAt)
        .max()
}

public func mapPullRequest(_ node: PullRequestNode, buckets: [SearchBucket], myLogin: String) -> PullRequest {
    let lastCommit = node.commits.nodes.first??.commit
    let conversationComments = flatten(node.comments.nodes)
    let reviewThreads = node.reviewThreads.nodes.compactMap { thread in
        thread.map { ReviewThread(id: $0.id, isResolved: $0.isResolved, comments: flatten($0.comments.nodes)) }
    }
    // Only unresolved threads count toward mentions, matching the "resolved is
    // invisible" rule — otherwise a mention in a resolved thread would keep the
    // PR in "Mentions" forever.
    let threadComments = reviewThreads.filter { !$0.isResolved }.flatMap(\.comments)

    let reviews: [Review] = node.reviews.nodes.compactMap { review in
        guard let review, let author = review.author, let submittedAt = review.submittedAt,
              let state = ReviewState(rawValue: review.state) else { return nil }
        return Review(
            authorLogin: author.login,
            state: state,
            submittedAt: submittedAt,
            bodyText: review.bodyText ?? "",
            commitSHA: review.commit?.oid
        )
    }

    return PullRequest(
        id: node.id,
        number: node.number,
        title: node.title,
        url: node.url,
        repository: node.repository.nameWithOwner,
        authorLogin: node.author?.login ?? deletedUserLogin,
        authorAvatarURL: node.author?.avatarUrl ?? "",
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        isDraft: node.isDraft,
        additions: node.additions,
        deletions: node.deletions,
        headRefName: node.headRefName,
        baseRefName: node.baseRefName,
        isCrossRepository: node.isCrossRepository ?? false,
        ciStatus: mapCIStatus(lastCommit?.statusCheckRollup?.state),
        lastCommitPushedAt: lastCommit?.committedDate ?? node.createdAt,
        headSHA: lastCommit?.oid,
        reviewDecision: node.reviewDecision.flatMap(ReviewDecision.init(rawValue:)),
        mergeable: MergeableState(rawValue: node.mergeable) ?? .unknown,
        hasAutoMerge: node.autoMergeRequest != nil,
        reviews: reviews,
        reviewThreads: reviewThreads,
        conversationComments: conversationComments,
        reviewRequestedAt: computeReviewRequestedAt(node, myLogin: myLogin),
        readyForReviewAt: computeReadyForReviewAt(node),
        mentionsAt: computeMentionsAt(node, comments: conversationComments + threadComments, reviews: reviews, myLogin: myLogin),
        buckets: buckets
    )
}
