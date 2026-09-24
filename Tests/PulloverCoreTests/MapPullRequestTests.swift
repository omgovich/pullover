import Testing
@testable import PulloverCore

private func map(_ n: PullRequestNode, _ buckets: [SearchBucket] = []) -> PullRequest {
    mapPullRequest(n, buckets: buckets, myLogin: "vlad")
}

@Suite struct MapPullRequestTests {
    @Suite("mapCiStatus") struct MapCIStatus {
        @Test("maps GitHub rollup states") func mapsStates() {
            #expect(mapCIStatus("SUCCESS") == .success)
            #expect(mapCIStatus("FAILURE") == .failure)
            #expect(mapCIStatus("ERROR") == .failure)
            #expect(mapCIStatus("PENDING") == .pending)
            #expect(mapCIStatus("EXPECTED") == .pending)
        }

        @Test("treats a missing rollup as no CI") func missingRollup() {
            #expect(mapCIStatus(nil) == CIStatus.none)
        }
    }

    @Suite("mapPullRequest") struct MapPullRequest {
        @Test("carries mergeability through") func mergeability() {
            #expect(map(node(["mergeable": "CONFLICTING"])).mergeable == .conflicting)
            #expect(map(node(["mergeable": "UNKNOWN"])).mergeable == .unknown)
        }

        @Test("reads auto-merge as armed exactly when the request exists") func autoMerge() {
            #expect(map(node(["autoMergeRequest": ["enabledAt": "2026-08-02T10:00:00Z"]])).hasAutoMerge)
            #expect(!map(node()).hasAutoMerge)
        }

        @Test("copies the scalar fields and attaches the buckets") func scalars() {
            let pr = map(node(["isDraft": true]), [.reviewRequested])
            #expect(pr.id == "PR_1")
            #expect(pr.number == 7)
            #expect(pr.title == "Add feature")
            #expect(pr.url == "https://github.com/acme/web/pull/7")
            #expect(pr.repository == "acme/web")
            #expect(pr.authorLogin == "alice")
            #expect(pr.isDraft)
            #expect(pr.additions == 12)
            #expect(pr.deletions == 3)
            #expect(pr.headRefName == "feature-branch")
            #expect(pr.baseRefName == "main")
            #expect(pr.createdAt == d("2026-08-01T10:00:00Z"))
            #expect(pr.updatedAt == d("2026-08-02T10:00:00Z"))
            #expect(pr.reviewDecision == .reviewRequired)
            #expect(pr.buckets == [.reviewRequested])
        }

        @Test("reads whether the head branch lives in a fork, defaulting to no") func crossRepository() {
            #expect(map(node(["isCrossRepository": true])).isCrossRepository)
            #expect(!map(node(["isCrossRepository": false])).isCrossRepository)
            #expect(!map(node()).isCrossRepository)
        }

        @Test("falls back to ghost for a deleted author") func ghostAuthor() {
            let pr = map(node(["author": jsonNull]))
            #expect(pr.authorLogin == "ghost")
            #expect(pr.authorAvatarURL == "")
        }

        @Test("flattens reviews and drops ones with no author") func flattensReviews() {
            let pr = map(node(["reviews": nodes([
                review("bob", "APPROVED", "2026-08-02T10:00:00Z"),
                review(nil, "COMMENTED", "2026-08-03T10:00:00Z"),
            ])]))
            #expect(pr.reviews == [makeReview("bob", "2026-08-02T10:00:00Z", state: .approved)])
        }

        @Test("reads the commit each review was made against, nil when GitHub sends none") func reviewCommitSHA() {
            let pr = map(node(["reviews": nodes([
                review("bob", "APPROVED", "2026-08-02T10:00:00Z", commitOID: "abc123"),
                review("carol", "COMMENTED", "2026-08-03T10:00:00Z"),
                ["author": ["login": "dave"], "state": "COMMENTED", "submittedAt": "2026-08-04T10:00:00Z", "commit": jsonNull],
            ])]))
            #expect(pr.reviews.map(\.commitSHA) == ["abc123", nil, nil])
        }

        @Test("preserves the order of reviews") func reviewOrder() {
            let pr = map(node(["reviews": nodes([
                review("first", "APPROVED", "2026-08-01T09:00:00Z"),
                review("second", "CHANGES_REQUESTED", "2026-08-02T09:00:00Z"),
                review("third", "COMMENTED", "2026-08-03T09:00:00Z"),
            ])]))
            #expect(pr.reviews == [
                makeReview("first", "2026-08-01T09:00:00Z", state: .approved),
                makeReview("second", "2026-08-02T09:00:00Z", state: .changesRequested),
                makeReview("third", "2026-08-03T09:00:00Z", state: .commented),
            ])
        }

        @Test("flattens review threads with their comments") func flattensThreads() {
            let pr = map(node(["reviewThreads": nodes([
                thread("RT_1", resolved: true, [comment("vlad", "2026-08-02T10:00:00Z")]),
            ])]))
            #expect(pr.reviewThreads == [
                makeThread(id: "RT_1", isResolved: true, comments: [makeComment("vlad", "2026-08-02T10:00:00Z")]),
            ])
        }

        @Test("preserves the order of review threads") func threadOrder() {
            let pr = map(node(["reviewThreads": nodes([
                thread("RT_1", resolved: false, [comment("vlad", "2026-08-01T10:00:00Z")]),
                thread("RT_2", resolved: true, [comment("alice", "2026-08-02T10:00:00Z")]),
            ])]))
            #expect(pr.reviewThreads.map(\.id) == ["RT_1", "RT_2"])
        }

        @Test("preserves the order of comments within a thread") func commentOrder() {
            let pr = map(node(["reviewThreads": nodes([
                thread("RT_1", resolved: false, [
                    comment("first", "2026-08-01T10:00:00Z"),
                    comment("second", "2026-08-02T10:00:00Z"),
                    comment("third", "2026-08-03T10:00:00Z"),
                ]),
            ])]))
            #expect(pr.reviewThreads[0].comments == [
                makeComment("first", "2026-08-01T10:00:00Z"),
                makeComment("second", "2026-08-02T10:00:00Z"),
                makeComment("third", "2026-08-03T10:00:00Z"),
            ])
        }

        @Test("reads the last commit date and CI status") func lastCommit() {
            let pr = map(node(["commits": nodes([commit("2026-08-04T10:00:00Z", "FAILURE")])]))
            #expect(pr.lastCommitPushedAt == d("2026-08-04T10:00:00Z"))
            #expect(pr.ciStatus == .failure)
        }

        @Test("reads the head commit's SHA") func headSHA() {
            let pr = map(node(["commits": nodes([
                ["commit": ["oid": "abc123", "committedDate": "2026-08-04T10:00:00Z", "statusCheckRollup": ["state": "SUCCESS"]]],
            ])]))
            #expect(pr.headSHA == "abc123")
        }

        @Test("leaves the SHA empty when the node has none") func noHeadSHA() {
            let pr = map(node(["commits": nodes([commit("2026-08-04T10:00:00Z", "SUCCESS")])]))
            #expect(pr.headSHA == nil)
        }

        @Test("reads lastCommitPushedAt and ciStatus from the first commit node when there are several") func firstCommitNode() {
            let pr = map(node(["commits": nodes([
                commit("2026-08-01T10:00:00Z", "SUCCESS"),
                commit("2026-08-05T10:00:00Z", "FAILURE"),
            ])]))
            #expect(pr.lastCommitPushedAt == d("2026-08-01T10:00:00Z"))
            #expect(pr.ciStatus == .success)
        }

        @Test("falls back to createdAt when the commit list is empty") func noCommits() {
            let pr = map(node())
            #expect(pr.lastCommitPushedAt == d("2026-08-01T10:00:00Z"))
            #expect(pr.ciStatus == CIStatus.none)
        }

        @Test("flattens conversation comments in order, skipping null nodes and keeping deleted authors as ghost") func conversationComments() {
            let pr = map(node(["comments": nodes([
                comment("alice", "2026-08-01T10:00:00Z", "first"),
                jsonNull,
                comment(nil, "2026-08-02T10:00:00Z", "from a deleted account"),
                comment("bob", "2026-08-03T10:00:00Z", "second"),
            ])]))
            #expect(pr.conversationComments == [
                makeComment("alice", "2026-08-01T10:00:00Z", "first"),
                makeComment("ghost", "2026-08-02T10:00:00Z", "from a deleted account"),
                makeComment("bob", "2026-08-03T10:00:00Z", "second"),
            ])
        }

        @Test("keeps a deleted user's last reply in a thread, so the thread still awaits my reply") func deletedUserLastReply() {
            let pr = map(node(["reviewThreads": nodes([
                thread("RT_1", resolved: false, [
                    comment("vlad", "2026-08-02T10:00:00Z", "why this?"),
                    comment(nil, "2026-08-03T10:00:00Z", "because"),
                ]),
            ])]))
            #expect(pr.reviewThreads.first?.comments.last == makeComment("ghost", "2026-08-03T10:00:00Z", "because"))
            #expect(threadsAwaitingMyReply(pr, myLogin: "vlad").map(\.id) == ["RT_1"])
        }

        @Test("drops a review with no submittedAt or an unknown state") func dropsUnmappableReviews() {
            var pending = review("vlad", "PENDING", "2026-08-02T10:00:00Z")
            pending["submittedAt"] = jsonNull
            let pr = map(node(["reviews": nodes([
                pending,
                review("bob", "SOMETHING_NEW", "2026-08-03T10:00:00Z"),
                review("carol", "APPROVED", "2026-08-04T10:00:00Z"),
            ])]))
            #expect(pr.reviews.map(\.authorLogin) == ["carol"])
        }
    }

    @Suite("mapPullRequest — reviewRequestedAt") struct ReviewRequestedAt {
        @Test("takes the most recent request naming me") func mostRecentNamingMe() {
            let n = node(["timelineItems": nodes([
                requested("vlad", "2026-07-20T10:00:00Z"),
                requested("vlad", "2026-08-01T10:00:00Z"),
            ])])
            #expect(map(n).reviewRequestedAt == d("2026-08-01T10:00:00Z"))
        }

        @Test("ignores requests naming somebody else") func ignoresOthers() {
            let n = node(["timelineItems": nodes([
                requested("vlad", "2026-07-20T10:00:00Z"),
                requested("bob", "2026-08-02T10:00:00Z"),
            ])])
            #expect(map(n).reviewRequestedAt == d("2026-07-20T10:00:00Z"))
        }

        @Test("falls back to a request naming nobody — a team or a bot") func fallsBackToAnonymous() {
            let n = node(["timelineItems": nodes([requestedAnonymously("2026-08-02T10:00:00Z")])])
            #expect(map(n).reviewRequestedAt == d("2026-08-02T10:00:00Z"))
        }

        @Test("prefers a request naming me over a later one naming nobody") func prefersNamed() {
            let n = node(["timelineItems": nodes([
                requested("vlad", "2026-08-01T10:00:00Z"),
                requestedAnonymously("2026-08-08T10:00:00Z"),
            ])])
            #expect(map(n).reviewRequestedAt == d("2026-08-01T10:00:00Z"))
        }

        @Test("does not read a request naming nobody out of a ready-for-review event") func notFromReadyForReview() {
            let n = node(["timelineItems": nodes([readyForReview("2026-08-02T10:00:00Z")])])
            #expect(map(n).reviewRequestedAt == nil)
        }

        @Test("is null when nothing was ever requested") func neverRequested() {
            #expect(map(node()).reviewRequestedAt == nil)
        }

        @Test("survives a null node") func nullNode() {
            #expect(map(node(["timelineItems": nodes([jsonNull])])).reviewRequestedAt == nil)
        }
    }

    @Suite("mapPullRequest — readyForReviewAt") struct ReadyForReviewAt {
        @Test("reads the moment the draft became reviewable") func readsMoment() {
            let n = node(["timelineItems": nodes([readyForReview("2026-08-05T10:00:00Z")])])
            #expect(map(n).readyForReviewAt == d("2026-08-05T10:00:00Z"))
        }

        @Test("is null for a PR that was never a draft") func neverDraft() {
            #expect(map(node()).readyForReviewAt == nil)
        }

        @Test("takes the last of several, a PR having been drafted more than once") func lastOfSeveral() {
            let n = node(["timelineItems": nodes([
                readyForReview("2026-08-02T10:00:00Z"),
                readyForReview("2026-08-06T10:00:00Z"),
            ])])
            #expect(map(n).readyForReviewAt == d("2026-08-06T10:00:00Z"))
        }
    }

    @Suite("mapPullRequest — mentionsAt") struct MentionsAt {
        @Test("picks the newest mention across conversation comments, thread comments and the PR body") func newestAcrossSources() {
            let pr = map(node([
                "bodyText": "cc @vlad for visibility",
                "createdAt": "2026-08-01T10:00:00Z",
                "comments": nodes([comment("alice", "2026-08-07T10:00:00Z", "@vlad ping")]),
                "reviewThreads": nodes([
                    thread("RT_1", resolved: false, [comment("bob", "2026-08-05T10:00:00Z", "hey @vlad look again")]),
                ]),
            ]))
            #expect(pr.mentionsAt.last == d("2026-08-07T10:00:00Z"))
        }

        @Test("counts a mention inside a review body, using the review submittedAt") func reviewBody() {
            let pr = map(node(["reviews": nodes([
                review("bob", "CHANGES_REQUESTED", "2026-08-06T10:00:00Z", bodyText: "@vlad take another look please"),
            ])]))
            #expect(pr.mentionsAt.last == d("2026-08-06T10:00:00Z"))
        }

        @Test("does not count a mention in a review the user authored themselves") func ownReview() {
            let pr = map(node(["reviews": nodes([
                review("vlad", "COMMENTED", "2026-08-06T10:00:00Z", bodyText: "@vlad reminding myself"),
            ])]))
            #expect(pr.mentionsAt.isEmpty)
        }

        @Test("does not count a self-mention in the pull request body") func ownBody() {
            let pr = map(node([
                "author": ["login": "vlad", "avatarUrl": ""],
                "bodyText": "@vlad note to self",
            ]))
            #expect(pr.mentionsAt.isEmpty)
        }

        @Test("ignores a mention inside a resolved review thread") func resolvedThread() {
            let pr = map(node(["reviewThreads": nodes([
                thread("RT_1", resolved: true, [comment("bob", "2026-08-06T10:00:00Z", "@vlad look at this")]),
            ])]))
            #expect(pr.mentionsAt.isEmpty)
        }

        @Test("prefers an older mention in an unresolved thread over a newer one in a resolved thread") func unresolvedOverResolved() {
            let pr = map(node(["reviewThreads": nodes([
                thread("RT_1", resolved: false, [comment("bob", "2026-08-02T10:00:00Z", "@vlad still open")]),
                thread("RT_2", resolved: true, [comment("bob", "2026-08-09T10:00:00Z", "@vlad but this got resolved")]),
            ])]))
            #expect(pr.mentionsAt.last == d("2026-08-02T10:00:00Z"))
        }

        @Test("counts a mention in a comment by a deleted user") func deletedUserMention() {
            let pr = map(node(["comments": nodes([comment(nil, "2026-08-04T10:00:00Z", "@vlad over to you")])]))
            #expect(pr.mentionsAt == [d("2026-08-04T10:00:00Z")])
        }

        @Test("does not count a mention the user wrote themselves") func ownComment() {
            let pr = map(node(["comments": nodes([comment("vlad", "2026-08-03T10:00:00Z", "@vlad reminding myself")])]))
            #expect(pr.mentionsAt.isEmpty)
        }

        @Test("is null when nobody mentioned the user") func noMention() {
            let pr = map(node([
                "bodyText": "nothing to see here",
                "comments": nodes([comment("alice", "2026-08-03T10:00:00Z", "no mention")]),
            ]))
            #expect(pr.mentionsAt.isEmpty)
        }
    }

    @Suite("mentionsUser") struct MentionsUser {
        @Test("is case-insensitive") func caseInsensitive() {
            #expect(mentionsUser("Hey @Vlad, can you take a look?", login: "vlad"))
            #expect(mentionsUser("Hey @vlad, can you take a look?", login: "VLAD"))
        }

        @Test("requires a word boundary after the login, so @vlad does not match @vladimir") func wordBoundary() {
            #expect(!mentionsUser("cc @vladimir for context", login: "vlad"))
        }

        @Test("does not match a different, hyphen-suffixed login sharing the same prefix") func hyphenSuffix() {
            #expect(!mentionsUser("cc @vlad-2 for review", login: "vlad"))
            #expect(!mentionsUser("ping @vlad-bot please", login: "vlad"))
        }

        @Test("does not match a login embedded in an email address") func emailAddress() {
            #expect(!mentionsUser("reach out to me@vlad.io for details", login: "vlad"))
        }

        @Test("returns false for text without the mention") func noMention() {
            #expect(!mentionsUser("nothing relevant here", login: "vlad"))
        }
    }
}
