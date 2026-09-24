import Foundation
@testable import PulloverCore

// Helpers needing Foundation live in files that never import Testing, and the
// test files never import Foundation: the pair pulls in the _Testing_Foundation
// overlay, which the Command Line Tools ship without a module for.

let me = "vlad"

func d(_ iso: String) -> Date {
    guard let date = ISODate.parse(iso) else { fatalError("Not an ISO 8601 date: \(iso)") }
    return date
}

func makeComment(_ authorLogin: String, _ createdAt: String, _ bodyText: String = "") -> ThreadComment {
    ThreadComment(authorLogin: authorLogin, createdAt: d(createdAt), bodyText: bodyText)
}

func makeReview(
    _ authorLogin: String,
    _ submittedAt: String,
    state: ReviewState = .commented,
    bodyText: String = "",
    commitSHA: String? = nil
) -> Review {
    Review(authorLogin: authorLogin, state: state, submittedAt: d(submittedAt), bodyText: bodyText, commitSHA: commitSHA)
}

func makeThread(id: String = "thread-1", isResolved: Bool = false, comments: [ThreadComment] = []) -> ReviewThread {
    ReviewThread(id: id, isResolved: isResolved, comments: comments)
}

func makePullRequest(_ configure: (inout PullRequest) -> Void = { _ in }) -> PullRequest {
    var pr = PullRequest(
        id: "PR_1",
        number: 1,
        title: "Add feature",
        url: "https://github.com/acme/web/pull/1",
        repository: "acme/web",
        authorLogin: "alice",
        authorAvatarURL: "https://avatars.example/alice.png",
        createdAt: d("2026-08-01T10:00:00Z"),
        updatedAt: d("2026-08-01T10:00:00Z"),
        isDraft: false,
        additions: 10,
        deletions: 2,
        headRefName: "feature-1",
        baseRefName: "main",
        ciStatus: .success,
        lastCommitPushedAt: d("2026-08-01T10:00:00Z"),
        reviewDecision: .reviewRequired,
        mergeable: .mergeable,
        hasAutoMerge: false,
        reviews: [],
        reviewThreads: [],
        conversationComments: [],
        reviewRequestedAt: nil,
        readyForReviewAt: nil,
        mentionsAt: [],
        buckets: []
    )
    configure(&pr)
    return pr
}
