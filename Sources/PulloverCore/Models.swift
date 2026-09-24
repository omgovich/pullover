import Foundation

public struct StackPosition: Hashable, Codable, Sendable {
    /// The root pull request's id: every member of a chain walks back to it,
    /// so two chains of the same length can be told apart.
    public var id: String
    /// 1-based position within the chain, counted from the root.
    public var index: Int
    public var total: Int

    public init(id: String, index: Int, total: Int) {
        self.id = id
        self.index = index
        self.total = total
    }
}

public enum CIStatus: String, Codable, Sendable {
    case success, failure, pending, none
}

public enum SearchBucket: String, Codable, CaseIterable, Sendable {
    case reviewRequested = "review-requested"
    case author
    case involves
    case mentions
}

public struct ThreadComment: Hashable, Codable, Sendable {
    public var authorLogin: String
    public var createdAt: Date
    public var bodyText: String

    public init(authorLogin: String, createdAt: Date, bodyText: String = "") {
        self.authorLogin = authorLogin
        self.createdAt = createdAt
        self.bodyText = bodyText
    }
}

public struct ReviewThread: Hashable, Codable, Sendable {
    public var id: String
    public var isResolved: Bool
    public var comments: [ThreadComment]

    public init(id: String, isResolved: Bool = false, comments: [ThreadComment]) {
        self.id = id
        self.isResolved = isResolved
        self.comments = comments
    }
}

public enum ReviewState: String, Codable, Sendable {
    case approved = "APPROVED"
    case changesRequested = "CHANGES_REQUESTED"
    case commented = "COMMENTED"
    case dismissed = "DISMISSED"
    case pending = "PENDING"
}

public struct Review: Hashable, Codable, Sendable {
    public var authorLogin: String
    public var state: ReviewState
    public var submittedAt: Date
    public var bodyText: String
    /// The head commit the review was submitted against. Nil when GitHub no
    /// longer has that commit, or for a review cached before it was fetched.
    public var commitSHA: String?

    public init(authorLogin: String, state: ReviewState, submittedAt: Date, bodyText: String = "", commitSHA: String? = nil) {
        self.authorLogin = authorLogin
        self.state = state
        self.submittedAt = submittedAt
        self.bodyText = bodyText
        self.commitSHA = commitSHA
    }
}

public enum ReviewDecision: String, Codable, Sendable {
    case approved = "APPROVED"
    case changesRequested = "CHANGES_REQUESTED"
    case reviewRequired = "REVIEW_REQUIRED"
}

/// GitHub computes mergeability in the background, so `unknown` means "not yet", not "maybe".
public enum MergeableState: String, Codable, Sendable {
    case mergeable = "MERGEABLE"
    case conflicting = "CONFLICTING"
    case unknown = "UNKNOWN"
}

public struct PullRequest: Hashable, Codable, Sendable, Identifiable {
    public var id: String
    public var number: Int
    public var title: String
    public var url: String
    /// `owner/repo`, in GitHub's casing.
    public var repository: String
    public var authorLogin: String
    public var authorAvatarURL: String
    public var createdAt: Date
    public var updatedAt: Date
    public var isDraft: Bool
    public var additions: Int
    public var deletions: Int
    public var headRefName: String
    public var baseRefName: String
    /// Whether the head branch lives in a fork rather than in `repository`.
    /// Such a `headRefName` names no branch of this repository.
    public var isCrossRepository: Bool
    public var ciStatus: CIStatus
    /// When the head commit was *made*, which is not when it reached the
    /// branch: a rebase or cherry-pick pushes commits dated in the past.
    public var lastCommitPushedAt: Date
    /// The head commit's SHA, or nil when it wasn't fetched. What a snooze
    /// compares to notice a push, since the date above can't be trusted to.
    public var headSHA: String?
    public var reviewDecision: ReviewDecision?
    public var mergeable: MergeableState
    /// Whether auto-merge is armed, so GitHub will merge this itself once checks pass.
    public var hasAutoMerge: Bool
    public var reviews: [Review]
    public var reviewThreads: [ReviewThread]
    /// Latest conversation-tab comments, oldest first. Inline review comments live in `reviewThreads`.
    public var conversationComments: [ThreadComment]
    /// When the user was last asked to review this PR, or nil if never.
    public var reviewRequestedAt: Date?
    /// When the pull request stopped being a draft, or nil if it never was one.
    /// The floor on any waiting time: before it, the PR was hidden.
    public var readyForReviewAt: Date?
    /// Every @-mention of the user on this PR, oldest first.
    public var mentionsAt: [Date]
    public var buckets: [SearchBucket]

    public init(
        id: String,
        number: Int,
        title: String,
        url: String,
        repository: String,
        authorLogin: String,
        authorAvatarURL: String = "",
        createdAt: Date,
        updatedAt: Date,
        isDraft: Bool = false,
        additions: Int = 0,
        deletions: Int = 0,
        headRefName: String = "",
        baseRefName: String = "main",
        isCrossRepository: Bool = false,
        ciStatus: CIStatus = .none,
        lastCommitPushedAt: Date,
        headSHA: String? = nil,
        reviewDecision: ReviewDecision? = nil,
        mergeable: MergeableState = .mergeable,
        hasAutoMerge: Bool = false,
        reviews: [Review] = [],
        reviewThreads: [ReviewThread] = [],
        conversationComments: [ThreadComment] = [],
        reviewRequestedAt: Date? = nil,
        readyForReviewAt: Date? = nil,
        mentionsAt: [Date] = [],
        buckets: [SearchBucket] = []
    ) {
        self.id = id
        self.number = number
        self.title = title
        self.url = url
        self.repository = repository
        self.authorLogin = authorLogin
        self.authorAvatarURL = authorAvatarURL
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isDraft = isDraft
        self.additions = additions
        self.deletions = deletions
        self.headRefName = headRefName
        self.baseRefName = baseRefName
        self.isCrossRepository = isCrossRepository
        self.ciStatus = ciStatus
        self.lastCommitPushedAt = lastCommitPushedAt
        self.headSHA = headSHA
        self.reviewDecision = reviewDecision
        self.mergeable = mergeable
        self.hasAutoMerge = hasAutoMerge
        self.reviews = reviews
        self.reviewThreads = reviewThreads
        self.conversationComments = conversationComments
        self.reviewRequestedAt = reviewRequestedAt
        self.readyForReviewAt = readyForReviewAt
        self.mentionsAt = mentionsAt
        self.buckets = buckets
    }
}

public enum Category: String, Codable, CaseIterable, Sendable {
    case needsReview = "needs-review"
    case newReplies = "new-replies"
    case reReview = "re-review"
    case myPRAction = "my-pr-action"
    case mentioned
    case waiting
    case hidden

    /// Categories that count toward the menu-bar badge, in display order.
    public static let attention: [Category] = [.needsReview, .newReplies, .reReview, .myPRAction, .mentioned]

    /// All visible categories, in display order. `waiting` renders last, collapsed.
    public static let visible: [Category] = attention + [.waiting]

    public var title: String {
        switch self {
        case .needsReview: "Needs your review"
        case .newReplies: "Replies to you"
        case .reReview: "Take another look"
        case .myPRAction: "Your PRs"
        case .mentioned: "Mentions"
        case .waiting: "Waiting on others"
        case .hidden: ""
        }
    }

    public var needsAttention: Bool { Category.attention.contains(self) }
}

public struct ClassifiedPullRequest: Hashable, Sendable, Identifiable {
    public var pr: PullRequest
    public var category: Category
    public var reason: String
    /// When the ball landed in the user's court, which is what each category is
    /// ordered by. Nil exactly for the categories where nothing is waiting on
    /// them, so a nil is the answer "not your move" rather than missing data.
    public var waitingSince: Date?
    public var isSnoozed: Bool
    /// This pull request's position within its stack, or nil when it isn't part of one.
    public var stack: StackPosition?

    public var id: String { pr.id }

    public init(
        pr: PullRequest,
        category: Category,
        reason: String,
        waitingSince: Date?,
        isSnoozed: Bool,
        stack: StackPosition? = nil
    ) {
        self.pr = pr
        self.category = category
        self.reason = reason
        self.waitingSince = waitingSince
        self.isSnoozed = isSnoozed
        self.stack = stack
    }
}

public enum SnoozeType: String, Codable, Sendable {
    case untilActivity = "until-activity"
    case untilTime = "until-time"
}

public struct Snooze: Hashable, Codable, Sendable {
    public var prId: String
    public var type: SnoozeType
    public var snoozedAt: Date
    /// Only set when `type == .untilTime`.
    public var until: Date?
    /// The head commit when the snooze was set, so any push wakes it. Nil for
    /// snoozes saved before it was recorded, which fall back to the date.
    public var headSHA: String?

    public init(prId: String, type: SnoozeType, snoozedAt: Date, until: Date? = nil, headSHA: String? = nil) {
        self.prId = prId
        self.type = type
        self.snoozedAt = snoozedAt
        self.until = until
        self.headSHA = headSHA
    }
}

public struct InboxSnapshot: Hashable, Sendable {
    public enum Status: String, Codable, Sendable {
        case signedOut = "signed-out"
        case loading
        case ready
        case error
    }

    public var status: Status
    public var items: [ClassifiedPullRequest]
    public var attentionCount: Int
    public var lastUpdatedAt: Date?
    public var errorMessage: String?
    public var myLogin: String?
    /// Repositories seen in the fetched pull requests, for the settings picker.
    public var knownRepositories: [String]

    public init(
        status: Status = .signedOut,
        items: [ClassifiedPullRequest] = [],
        attentionCount: Int = 0,
        lastUpdatedAt: Date? = nil,
        errorMessage: String? = nil,
        myLogin: String? = nil,
        knownRepositories: [String] = []
    ) {
        self.status = status
        self.items = items
        self.attentionCount = attentionCount
        self.lastUpdatedAt = lastUpdatedAt
        self.errorMessage = errorMessage
        self.myLogin = myLogin
        self.knownRepositories = knownRepositories
    }

    public static let signedOut = InboxSnapshot()
}
