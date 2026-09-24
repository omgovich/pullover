import Foundation
@testable import PulloverCore

// Apart from MapPullRequestTests for the reason given in TestFactory.swift.

var jsonNull: Any { NSNull() }

/// Builds a node the way GitHub sends it: as JSON, decoded with the app's own decoder.
func node(_ overrides: [String: Any] = [:]) -> PullRequestNode {
    var json: [String: Any] = [
        "id": "PR_1",
        "number": 7,
        "title": "Add feature",
        "url": "https://github.com/acme/web/pull/7",
        "isDraft": false,
        "createdAt": "2026-08-01T10:00:00Z",
        "updatedAt": "2026-08-02T10:00:00Z",
        "additions": 12,
        "deletions": 3,
        "headRefName": "feature-branch",
        "baseRefName": "main",
        "reviewDecision": "REVIEW_REQUIRED",
        "mergeable": "MERGEABLE",
        "autoMergeRequest": jsonNull,
        "author": ["login": "alice", "avatarUrl": "https://avatars.example/alice.png"],
        "repository": ["nameWithOwner": "acme/web"],
        "reviews": ["nodes": []],
        "reviewThreads": ["nodes": []],
        "comments": ["nodes": []],
        "bodyText": "",
        "commits": ["nodes": []],
        "timelineItems": ["nodes": []],
    ]
    json.merge(overrides) { _, new in new }
    let data = try! JSONSerialization.data(withJSONObject: json)
    return try! ISODate.makeDecoder().decode(PullRequestNode.self, from: data)
}

func nodes(_ items: [Any]) -> [String: Any] { ["nodes": items] }

func comment(_ login: String?, _ createdAt: String, _ bodyText: String = "") -> [String: Any] {
    ["author": login.map { ["login": $0] as Any } ?? jsonNull, "createdAt": createdAt, "bodyText": bodyText]
}

func review(_ login: String?, _ state: String, _ submittedAt: String, bodyText: String? = nil, commitOID: String? = nil) -> [String: Any] {
    var review: [String: Any] = [
        "author": login.map { ["login": $0] as Any } ?? jsonNull,
        "state": state,
        "submittedAt": submittedAt,
    ]
    if let bodyText { review["bodyText"] = bodyText }
    if let commitOID { review["commit"] = ["oid": commitOID] }
    return review
}

func thread(_ id: String, resolved: Bool, _ comments: [[String: Any]]) -> [String: Any] {
    ["id": id, "isResolved": resolved, "comments": nodes(comments)]
}

func commit(_ committedDate: String, _ rollup: String) -> [String: Any] {
    ["commit": ["committedDate": committedDate, "statusCheckRollup": ["state": rollup]]]
}

func requested(_ login: String?, _ createdAt: String) -> [String: Any] {
    [
        "__typename": "ReviewRequestedEvent",
        "createdAt": createdAt,
        "requestedReviewer": login.map { ["login": $0] as Any } ?? jsonNull,
    ]
}

/// A team or bot reviewer: the inline fragment matches nothing.
func requestedAnonymously(_ createdAt: String) -> [String: Any] {
    ["__typename": "ReviewRequestedEvent", "createdAt": createdAt, "requestedReviewer": [String: Any]()]
}

func readyForReview(_ createdAt: String) -> [String: Any] {
    ["__typename": "ReadyForReviewEvent", "createdAt": createdAt]
}
