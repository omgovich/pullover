import Testing
@testable import PulloverCore

private func authored(_ configure: (inout PullRequest) -> Void = { _ in }) -> PullRequest {
    makePullRequest {
        $0.authorLogin = "me-the-author"
        configure(&$0)
    }
}

@Suite struct ThreadsTests {
    @Suite("lastComment") struct LastComment {
        @Test("returns null for an empty thread") func emptyThread() {
            #expect(lastComment(makeThread()) == nil)
        }

        @Test("returns the final comment") func finalComment() {
            let thread = makeThread(comments: [
                makeComment(me, "2026-08-01T10:00:00Z"),
                makeComment("alice", "2026-08-02T10:00:00Z"),
            ])
            #expect(lastComment(thread)?.authorLogin == "alice")
        }
    }

    @Suite("unresolvedThreads") struct UnresolvedThreads {
        @Test("drops resolved threads") func dropsResolved() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", isResolved: true), makeThread(id: "b", isResolved: false)]
            }
            #expect(unresolvedThreads(pr).map(\.id) == ["b"])
        }
    }

    @Suite("threadsAwaitingMyReply") struct AwaitingMyReply {
        @Test("finds threads I am in where somebody else spoke last") func findsThreads() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", comments: [
                    makeComment(me, "2026-08-01T10:00:00Z"),
                    makeComment("alice", "2026-08-02T10:00:00Z"),
                ])]
            }
            #expect(threadsAwaitingMyReply(pr, myLogin: me).map(\.id) == ["a"])
        }

        @Test("ignores threads where I spoke last") func ignoresMyLast() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", comments: [
                    makeComment("alice", "2026-08-01T10:00:00Z"),
                    makeComment(me, "2026-08-02T10:00:00Z"),
                ])]
            }
            #expect(threadsAwaitingMyReply(pr, myLogin: me).isEmpty)
        }

        @Test("ignores threads I never commented in") func ignoresNotMine() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", comments: [makeComment("alice", "2026-08-01T10:00:00Z")])]
            }
            #expect(threadsAwaitingMyReply(pr, myLogin: me).isEmpty)
        }

        @Test("ignores resolved threads even when somebody replied to me") func ignoresResolved() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", isResolved: true, comments: [
                    makeComment(me, "2026-08-01T10:00:00Z"),
                    makeComment("alice", "2026-08-02T10:00:00Z"),
                ])]
            }
            #expect(threadsAwaitingMyReply(pr, myLogin: me).isEmpty)
        }
    }

    @Suite("unansweredThreads") struct Unanswered {
        @Test("includes unresolved threads I never commented in") func includesNotMine() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", comments: [makeComment("alice", "2026-08-01T10:00:00Z")])]
            }
            #expect(unansweredThreads(pr, myLogin: me).map(\.id) == ["a"])
        }

        @Test("excludes threads where I spoke last") func excludesMyLast() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", comments: [
                    makeComment("alice", "2026-08-01T10:00:00Z"),
                    makeComment(me, "2026-08-02T10:00:00Z"),
                ])]
            }
            #expect(unansweredThreads(pr, myLogin: me).isEmpty)
        }

        @Test("excludes resolved threads") func excludesResolved() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(id: "a", isResolved: true, comments: [makeComment("alice", "2026-08-01T10:00:00Z")])]
            }
            #expect(unansweredThreads(pr, myLogin: me).isEmpty)
        }
    }

    @Suite("myLatestReview") struct MyLatestReview {
        @Test("returns null when I never reviewed") func neverReviewed() {
            #expect(myLatestReview(makePullRequest(), myLogin: me) == nil)
        }

        @Test("returns my most recent submitted review") func mostRecent() {
            let pr = makePullRequest {
                $0.reviews = [
                    makeReview(me, "2026-08-01T10:00:00Z", state: .commented),
                    makeReview("alice", "2026-08-05T10:00:00Z", state: .approved),
                    makeReview(me, "2026-08-03T10:00:00Z", state: .changesRequested),
                ]
            }
            #expect(myLatestReview(pr, myLogin: me)?.state == .changesRequested)
        }

        @Test("returns the chronologically latest review when my reviews are not in order") func chronological() {
            let pr = makePullRequest {
                $0.reviews = [
                    makeReview(me, "2026-08-07T10:00:00Z", state: .commented),
                    makeReview("alice", "2026-08-05T10:00:00Z", state: .approved),
                    makeReview(me, "2026-08-02T10:00:00Z", state: .changesRequested),
                ]
            }
            #expect(myLatestReview(pr, myLogin: me)?.submittedAt == d("2026-08-07T10:00:00Z"))
        }

        @Test("ignores my unsubmitted PENDING draft review") func ignoresPending() {
            let pr = makePullRequest { $0.reviews = [makeReview(me, "2026-08-09T10:00:00Z", state: .pending)] }
            #expect(myLatestReview(pr, myLogin: me) == nil)
        }
    }

    @Suite("hasCommitsSince") struct HasCommitsSince {
        private let review = makeReview(me, "2026-08-05T10:00:00Z", commitSHA: "reviewed")

        @Test("sees a new head even when its commit is dated before the review") func backdatedNewHead() {
            let pr = makePullRequest { $0.headSHA = "rebased"; $0.lastCommitPushedAt = d("2026-08-01T10:00:00Z") }
            #expect(hasCommitsSince(review, in: pr))
        }

        @Test("sees nothing new at the reviewed head even when its date is later") func sameHeadLaterDate() {
            let pr = makePullRequest { $0.headSHA = "reviewed"; $0.lastCommitPushedAt = d("2026-08-09T10:00:00Z") }
            #expect(!hasCommitsSince(review, in: pr))
        }

        @Test("falls back to dates when the review has no SHA") func reviewWithoutSHA() {
            let old = makeReview(me, "2026-08-05T10:00:00Z")
            #expect(hasCommitsSince(old, in: makePullRequest { $0.headSHA = "x"; $0.lastCommitPushedAt = d("2026-08-06T10:00:00Z") }))
            #expect(!hasCommitsSince(old, in: makePullRequest { $0.headSHA = "x"; $0.lastCommitPushedAt = d("2026-08-04T10:00:00Z") }))
        }

        @Test("falls back to dates when the head has no SHA") func headWithoutSHA() {
            #expect(hasCommitsSince(review, in: makePullRequest { $0.lastCommitPushedAt = d("2026-08-06T10:00:00Z") }))
            #expect(!hasCommitsSince(review, in: makePullRequest { $0.lastCommitPushedAt = d("2026-08-04T10:00:00Z") }))
        }
    }

    // compareIso is not ported: it orders ISO strings, and Swift compares `Date`s directly.

    @Suite("hasParticipated") struct HasParticipated {
        @Test("is false on an untouched PR") func untouched() {
            #expect(!hasParticipated(makePullRequest(), myLogin: me))
        }

        @Test("is true when I submitted a review") func reviewed() {
            let pr = makePullRequest { $0.reviews = [makeReview(me, "2026-08-01T10:00:00Z")] }
            #expect(hasParticipated(pr, myLogin: me))
        }

        @Test("is true when I commented in a thread, even a resolved one") func threadComment() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(isResolved: true, comments: [makeComment(me, "2026-08-01T10:00:00Z")])]
            }
            #expect(hasParticipated(pr, myLogin: me))
        }

        @Test("is true when I only commented in the conversation") func conversationComment() {
            let pr = makePullRequest { $0.conversationComments = [makeComment(me, "2026-08-01T10:00:00Z")] }
            #expect(hasParticipated(pr, myLogin: me))
        }
    }

    @Suite("myLastActivityAt") struct MyLastActivityAt {
        @Test("returns null when I have no activity at all") func noActivity() {
            #expect(myLastActivityAt(makePullRequest(), myLogin: me) == nil)
        }

        @Test("returns the latest across my reviews, thread comments and conversation comments") func latestAcrossSources() {
            let pr = makePullRequest {
                $0.reviews = [makeReview(me, "2026-08-01T10:00:00Z")]
                $0.reviewThreads = [makeThread(comments: [makeComment(me, "2026-08-04T10:00:00Z")])]
                $0.conversationComments = [makeComment(me, "2026-08-07T10:00:00Z")]
            }
            #expect(myLastActivityAt(pr, myLogin: me) == d("2026-08-07T10:00:00Z"))
        }

        @Test("ignores activity by other people") func ignoresOthers() {
            let pr = makePullRequest {
                $0.reviews = [makeReview("alice", "2026-08-09T10:00:00Z", state: .approved)]
                $0.reviewThreads = [makeThread(comments: [makeComment("alice", "2026-08-08T10:00:00Z")])]
                $0.conversationComments = [makeComment("alice", "2026-08-07T10:00:00Z")]
            }
            #expect(myLastActivityAt(pr, myLogin: me) == nil)
        }
    }

    @Suite("hasNewReplyInMyThreadsSince") struct HasNewReply {
        let since = d("2026-08-02T00:00:00Z")

        @Test("is true when somebody replied to my thread after the cutoff") func replyAfterCutoff() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(comments: [
                    makeComment(me, "2026-08-01T10:00:00Z"),
                    makeComment("alice", "2026-08-03T10:00:00Z"),
                ])]
            }
            #expect(hasNewReplyInMyThreads(pr, myLogin: me, since: since))
        }

        @Test("is false when the only new comment is my own") func onlyMine() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(comments: [
                    makeComment(me, "2026-08-01T10:00:00Z"),
                    makeComment(me, "2026-08-03T10:00:00Z"),
                ])]
            }
            #expect(!hasNewReplyInMyThreads(pr, myLogin: me, since: since))
        }

        @Test("is false when the reply predates the cutoff") func replyBeforeCutoff() {
            let pr = makePullRequest {
                $0.reviewThreads = [makeThread(comments: [
                    makeComment(me, "2026-08-01T09:00:00Z"),
                    makeComment("alice", "2026-08-01T10:00:00Z"),
                ])]
            }
            #expect(!hasNewReplyInMyThreads(pr, myLogin: me, since: since))
        }
    }

    @Suite("oldestPendingReplyAt") struct OldestPendingReplyAt {
        @Test("takes the oldest thread, not the noisiest") func oldestThread() {
            let stale = makeThread(id: "stale", comments: [makeComment("alice", "2026-08-01T10:00:00Z")])
            let fresh = makeThread(id: "fresh", comments: [makeComment("alice", "2026-08-09T10:00:00Z")])
            #expect(oldestPendingReplyAt([fresh, stale], myLogin: me) == d("2026-08-01T10:00:00Z"))
        }

        @Test("is not reset by a later nudge in the same thread") func notResetByNudge() {
            let thread = makeThread(comments: [
                makeComment(me, "2026-08-01T10:00:00Z"),
                makeComment("alice", "2026-08-02T10:00:00Z"),
                makeComment("alice", "2026-08-09T10:00:00Z"),
            ])
            #expect(oldestPendingReplyAt([thread], myLogin: me) == d("2026-08-02T10:00:00Z"))
        }

        @Test("starts from the comment after my last, not the thread's first") func afterMyLast() {
            let thread = makeThread(comments: [
                makeComment("alice", "2026-08-01T10:00:00Z"),
                makeComment(me, "2026-08-03T10:00:00Z"),
                makeComment("alice", "2026-08-05T10:00:00Z"),
                makeComment("bob", "2026-08-06T10:00:00Z"),
            ])
            #expect(oldestPendingReplyAt([thread], myLogin: me) == d("2026-08-05T10:00:00Z"))
        }

        @Test("takes a thread's first comment when I have never spoken in it") func neverSpoken() {
            let thread = makeThread(comments: [
                makeComment("alice", "2026-08-02T10:00:00Z"),
                makeComment("bob", "2026-08-08T10:00:00Z"),
            ])
            #expect(oldestPendingReplyAt([thread], myLogin: me) == d("2026-08-02T10:00:00Z"))
        }

        @Test("is null for a thread I spoke last in") func spokeLast() {
            let thread = makeThread(comments: [
                makeComment("alice", "2026-08-01T10:00:00Z"),
                makeComment(me, "2026-08-02T10:00:00Z"),
            ])
            #expect(oldestPendingReplyAt([thread], myLogin: me) == nil)
        }

        @Test("is null for no threads and for an empty thread") func emptyInputs() {
            #expect(oldestPendingReplyAt([], myLogin: me) == nil)
            #expect(oldestPendingReplyAt([makeThread(comments: [])], myLogin: me) == nil)
        }
    }

    @Suite("oldestBlockingChangeRequestAt") struct OldestBlockingChangeRequestAt {
        @Test("takes the oldest request still standing, not the newest") func oldestStanding() {
            let pr = authored {
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("alice", "2026-08-08T10:00:00Z", state: .changesRequested),
                ]
            }
            #expect(oldestBlockingChangeRequestAt(pr) == d("2026-08-02T10:00:00Z"))
        }

        @Test("ignores a request its reviewer has since approved away") func approvedAway() {
            let pr = authored {
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("alice", "2026-08-08T10:00:00Z", state: .changesRequested),
                    makeReview("bob", "2026-08-09T10:00:00Z", state: .approved),
                ]
            }
            #expect(oldestBlockingChangeRequestAt(pr) == d("2026-08-08T10:00:00Z"))
        }

        @Test("keeps a request standing through the reviewer's later comment") func survivesComment() {
            let pr = authored {
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("bob", "2026-08-09T10:00:00Z", state: .commented),
                ]
            }
            #expect(oldestBlockingChangeRequestAt(pr) == d("2026-08-02T10:00:00Z"))
        }

        @Test("dates a reviewer who approved and then asked again from the second ask") func askedAgain() {
            let pr = authored {
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("bob", "2026-08-03T10:00:00Z", state: .approved),
                    makeReview("bob", "2026-08-07T10:00:00Z", state: .changesRequested),
                ]
            }
            #expect(oldestBlockingChangeRequestAt(pr) == d("2026-08-07T10:00:00Z"))
        }

        @Test("reads history in order however the reviews arrive") func outOfOrder() {
            let pr = authored {
                $0.reviews = [
                    makeReview("bob", "2026-08-03T10:00:00Z", state: .approved),
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                ]
            }
            #expect(oldestBlockingChangeRequestAt(pr) == nil)
        }

        @Test("keeps the first of one reviewer's two unanswered requests") func firstOfTwo() {
            let pr = authored {
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("bob", "2026-08-07T10:00:00Z", state: .changesRequested),
                ]
            }
            #expect(oldestBlockingChangeRequestAt(pr) == d("2026-08-02T10:00:00Z"))
        }

        @Test("treats a dismissed approval as clearing, not as reviving the request") func dismissedClears() {
            let pr = authored {
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("bob", "2026-08-05T10:00:00Z", state: .dismissed),
                ]
            }
            #expect(oldestBlockingChangeRequestAt(pr) == nil)
        }

        @Test("ignores a dismissed request") func dismissedRequest() {
            let pr = authored { $0.reviews = [makeReview("bob", "2026-08-02T10:00:00Z", state: .dismissed)] }
            #expect(oldestBlockingChangeRequestAt(pr) == nil)
        }

        @Test("is null when nobody has asked for changes") func nobodyAsked() {
            #expect(oldestBlockingChangeRequestAt(authored()) == nil)
        }
    }

    @Suite("approvedSince") struct ApprovedSince {
        @Test("takes the first approval, not a later one piling on") func firstApproval() {
            let pr = authored {
                $0.reviews = [
                    makeReview("alice", "2026-08-01T10:00:00Z", state: .approved),
                    makeReview("bob", "2026-08-08T10:00:00Z", state: .approved),
                ]
            }
            #expect(approvedSince(pr) == d("2026-08-01T10:00:00Z"))
        }

        @Test("ignores approvals given before the last request for changes") func afterLastBlock() {
            let pr = authored {
                $0.reviews = [
                    makeReview("alice", "2026-08-01T10:00:00Z", state: .approved),
                    makeReview("bob", "2026-08-03T10:00:00Z", state: .changesRequested),
                    makeReview("bob", "2026-08-05T10:00:00Z", state: .approved),
                ]
            }
            #expect(approvedSince(pr) == d("2026-08-05T10:00:00Z"))
        }

        @Test("ignores the author approving their own pull request") func selfApproval() {
            let pr = makePullRequest {
                $0.authorLogin = "alice"
                $0.reviews = [makeReview("alice", "2026-08-05T10:00:00Z", state: .approved)]
            }
            #expect(approvedSince(pr) == nil)
        }

        @Test("is null when nobody has approved") func nobodyApproved() {
            #expect(approvedSince(authored()) == nil)
        }
    }
}
