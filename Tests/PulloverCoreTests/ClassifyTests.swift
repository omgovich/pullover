import Testing
@testable import PulloverCore

private let now = d("2026-08-10T12:00:00Z")

private func ctx(_ snoozes: [String: Snooze] = [:]) -> ClassifyContext {
    ClassifyContext(myLogin: me, snoozes: snoozes, now: now)
}

private func mine(_ configure: (inout PullRequest) -> Void = { _ in }) -> PullRequest {
    makePullRequest {
        $0.authorLogin = me
        $0.buckets = [.author]
        configure(&$0)
    }
}

private func untilTime(snoozedAt: String, until: String) -> [String: Snooze] {
    ["PR_1": Snooze(prId: "PR_1", type: .untilTime, snoozedAt: d(snoozedAt), until: d(until))]
}

private func repliedThread(id: String = "thread-1", replyAt: String = "2026-08-02T10:00:00Z") -> ReviewThread {
    makeThread(id: id, comments: [makeComment(me, "2026-08-01T10:00:00Z"), makeComment("alice", replyAt)])
}

@Suite struct ClassifyTests {
    @Suite("classify — visibility overrides") struct Visibility {
        @Test("hides drafts") func hidesDrafts() {
            let pr = makePullRequest { $0.isDraft = true; $0.buckets = [.reviewRequested] }
            #expect(classify(pr, context: ctx()).category == .hidden)
        }

        @Test("hides a PR I am neither requested on nor involved in") func hidesUninvolved() {
            let pr = makePullRequest { $0.buckets = [.involves] }
            #expect(classify(pr, context: ctx()).category == .hidden)
        }
    }

    @Suite("classify — reviewer branch") struct ReviewerBranch {
        @Test("needs-review when requested and untouched") func needsReview() {
            let result = classify(makePullRequest { $0.buckets = [.reviewRequested] }, context: ctx())
            #expect(result.category == .needsReview)
            #expect(result.reason == "Review requested")
        }

        @Test("new-replies when somebody answered my thread") func newReplies() {
            let pr = makePullRequest { $0.buckets = [.involves]; $0.reviewThreads = [repliedThread()] }
            let result = classify(pr, context: ctx())
            #expect(result.category == .newReplies)
            #expect(result.reason == "1 new reply")
        }

        @Test("pluralises the reply count") func pluralisesReplies() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviewThreads = [repliedThread(id: "a"), repliedThread(id: "b"), repliedThread(id: "c")]
            }
            #expect(classify(pr, context: ctx()).reason == "3 new replies")
        }

        @Test("ignores a resolved thread that somebody answered") func ignoresResolvedThread() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviewThreads = [makeThread(isResolved: true, comments: [
                    makeComment(me, "2026-08-01T10:00:00Z"),
                    makeComment("alice", "2026-08-02T10:00:00Z"),
                ])]
            }
            #expect(classify(pr, context: ctx()).category == .waiting)
        }

        @Test("re-review when a commit landed after my review") func reReviewOnCommit() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-01T10:00:00Z", state: .changesRequested)]
                $0.lastCommitPushedAt = d("2026-08-05T10:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .reReview)
            #expect(result.reason == "New commits")
        }

        @Test("re-review when a rebased commit dated before my review replaced the one I reviewed")
        func reReviewOnBackdatedCommit() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z", state: .changesRequested, commitSHA: "reviewed")]
                $0.headSHA = "rebased"
                $0.lastCommitPushedAt = d("2026-08-03T10:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .reReview)
            #expect(result.reason == "New commits")
        }

        @Test("no re-review while the head is still the commit I reviewed, whatever its date says")
        func noReReviewOnSameCommit() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z", state: .changesRequested, commitSHA: "reviewed")]
                $0.headSHA = "reviewed"
                $0.lastCommitPushedAt = d("2026-08-06T10:00:00Z")
            }
            #expect(classify(pr, context: ctx()).category == .waiting)
        }

        @Test("falls back to dates for a review with no recorded commit") func reReviewDateFallback() {
            let newer = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z", state: .changesRequested)]
                $0.headSHA = "head"
                $0.lastCommitPushedAt = d("2026-08-06T10:00:00Z")
            }
            #expect(classify(newer, context: ctx()).reason == "New commits")

            var older = newer
            older.lastCommitPushedAt = d("2026-08-04T10:00:00Z")
            #expect(classify(older, context: ctx()).category == .waiting)
        }

        @Test("re-review when review was re-requested after I reviewed") func reReviewOnRequest() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested, .involves]
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z", state: .changesRequested)]
                $0.lastCommitPushedAt = d("2026-08-01T10:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .reReview)
            #expect(result.reason == "Re-review requested")
        }

        @Test("new-replies outranks re-review") func newRepliesOutranksReReview() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-01T10:00:00Z")]
                $0.lastCommitPushedAt = d("2026-08-05T10:00:00Z")
                $0.reviewThreads = [repliedThread()]
            }
            #expect(classify(pr, context: ctx()).category == .newReplies)
        }

        @Test("mentioned when only @-mentioned") func mentionedOnly() {
            let pr = makePullRequest {
                $0.buckets = [.mentions, .involves]
                $0.mentionsAt = [d("2026-08-05T10:00:00Z")]
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .mentioned)
            #expect(result.reason == "Mentioned")
        }

        @Test("mentioned when the mention is newer than my last activity, even though I participated")
        func mentionedAfterParticipation() {
            let pr = makePullRequest {
                $0.buckets = [.involves, .mentions]
                $0.reviews = [makeReview(me, "2026-08-01T10:00:00Z")]
                $0.lastCommitPushedAt = d("2026-08-01T10:00:00Z")
                $0.mentionsAt = [d("2026-08-05T10:00:00Z")]
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .mentioned)
            #expect(result.reason == "Mentioned")
        }

        @Test("not mentioned when the mention predates my last activity — falls through to waiting")
        func mentionPredatesActivity() {
            let pr = makePullRequest {
                $0.buckets = [.involves, .mentions]
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z")]
                $0.lastCommitPushedAt = d("2026-08-01T10:00:00Z")
                $0.mentionsAt = [d("2026-08-01T10:00:00Z")]
            }
            #expect(classify(pr, context: ctx()).category == .waiting)
        }

        @Test("surfaces a PR GitHub matched as a mention even when the text scan found no mention, rather than hiding it")
        func unlocatedMentionSurfaces() {
            let pr = makePullRequest { $0.buckets = [.mentions]; $0.mentionsAt = [] }
            #expect(classify(pr, context: ctx()).category == .mentioned)
        }

        @Test("treats an unlocated mention as no newer than the PR itself, not as unconditionally new")
        func unlocatedMentionNotNew() {
            let pr = makePullRequest {
                $0.buckets = [.involves, .mentions]
                $0.updatedAt = d("2026-08-01T10:00:00Z")
                $0.mentionsAt = []
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z")]
            }
            #expect(classify(pr, context: ctx()).category == .waiting)
        }

        @Test("stays waiting when requested and participated only via a conversation comment, even with a newer mention")
        func requestedAndCommentedStaysWaiting() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested, .mentions]
                $0.conversationComments = [makeComment(me, "2026-08-01T10:00:00Z")]
                $0.mentionsAt = [d("2026-08-05T10:00:00Z")]
            }
            #expect(classify(pr, context: ctx()).category == .waiting)
        }

        @Test("is waiting, not hidden, when I only commented in the conversation") func conversationOnly() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.conversationComments = [makeComment(me, "2026-08-01T10:00:00Z")]
            }
            #expect(classify(pr, context: ctx()).category == .waiting)
        }

        @Test("needs-review outranks mentioned") func needsReviewOutranksMentioned() {
            let pr = makePullRequest { $0.buckets = [.mentions, .reviewRequested] }
            #expect(classify(pr, context: ctx()).category == .needsReview)
        }

        @Test("waiting when I reviewed and the author has not moved") func waitingOnAuthor() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z", state: .changesRequested)]
                $0.lastCommitPushedAt = d("2026-08-01T10:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .waiting)
            #expect(result.reason == "Waiting on author")
        }
    }

    @Suite("classify — author branch") struct AuthorBranch {
        @Test("my-pr-action on changes requested") func changesRequested() {
            let result = classify(mine { $0.reviewDecision = .changesRequested }, context: ctx())
            #expect(result.category == .myPRAction)
            #expect(result.reason == "Changes requested")
        }

        @Test("my-pr-action on a reviewer thread I have not answered") func unansweredThread() {
            let pr = mine { $0.reviewThreads = [makeThread(comments: [makeComment("alice", "2026-08-02T10:00:00Z")])] }
            let result = classify(pr, context: ctx())
            #expect(result.category == .myPRAction)
            #expect(result.reason == "1 open thread")
        }

        @Test("pluralises the unanswered thread count") func pluralisesThreads() {
            let pr = mine {
                $0.reviewThreads = ["a", "b"].map { makeThread(id: $0, comments: [makeComment("alice", "2026-08-02T10:00:00Z")]) }
            }
            #expect(classify(pr, context: ctx()).reason == "2 open threads")
        }

        @Test("ignores resolved threads on my own PR") func ignoresResolved() {
            let pr = mine {
                $0.reviewThreads = [makeThread(isResolved: true, comments: [makeComment("alice", "2026-08-02T10:00:00Z")])]
            }
            #expect(classify(pr, context: ctx()).category == .waiting)
        }

        @Test("my-pr-action on CI failure") func ciFailure() {
            let result = classify(mine { $0.ciStatus = .failure }, context: ctx())
            #expect(result.category == .myPRAction)
            #expect(result.reason == "CI is red")
        }

        @Test("my-pr-action when approved and mergeable") func approved() {
            let result = classify(mine { $0.reviewDecision = .approved }, context: ctx())
            #expect(result.category == .myPRAction)
            #expect(result.reason == "Ready to merge")
        }

        @Test("CI failure outranks the approval") func ciOutranksApproval() {
            let pr = mine { $0.reviewDecision = .approved; $0.ciStatus = .failure }
            #expect(classify(pr, context: ctx()).reason == "CI is red")
        }

        @Test("waiting while reviewers have not responded") func waitingOnReviewers() {
            let result = classify(mine { $0.reviewDecision = .reviewRequired }, context: ctx())
            #expect(result.category == .waiting)
            #expect(result.reason == "Waiting on reviewers")
        }

        @Test("my-pr-action on a merge conflict") func mergeConflict() {
            let result = classify(mine { $0.mergeable = .conflicting }, context: ctx())
            #expect(result.category == .myPRAction)
            #expect(result.reason == "Merge conflicts")
        }

        @Test("treats an unknown mergeability as not conflicting") func unknownMergeability() {
            #expect(classify(mine { $0.mergeable = .unknown }, context: ctx()).category == .waiting)
        }

        @Test("changes requested outranks a merge conflict") func changesOutrankConflict() {
            let pr = mine { $0.reviewDecision = .changesRequested; $0.mergeable = .conflicting }
            #expect(classify(pr, context: ctx()).reason == "Changes requested")
        }

        @Test("a merge conflict outranks an unanswered thread") func conflictOutranksThread() {
            let pr = mine {
                $0.mergeable = .conflicting
                $0.reviewThreads = [makeThread(comments: [makeComment("alice", "2026-08-02T10:00:00Z")])]
            }
            #expect(classify(pr, context: ctx()).reason == "Merge conflicts")
        }

        @Test("hides an approved pull request with auto-merge armed") func hidesAutoMerge() {
            let result = classify(mine { $0.reviewDecision = .approved; $0.hasAutoMerge = true }, context: ctx())
            #expect(result.category == .hidden)
            #expect(result.reason == "")
        }

        @Test("drops the auto-merging pull request from the inbox entirely") func dropsAutoMerge() {
            let pr = mine { $0.reviewDecision = .approved; $0.hasAutoMerge = true }
            #expect(classifyAll([pr], context: ctx()).isEmpty)
        }

        @Test("auto-merge does not suppress the other action reasons") func autoMergeKeepsBlockers() {
            let blocked: [((inout PullRequest) -> Void, String)] = [
                ({ $0.reviewDecision = .changesRequested }, "Changes requested"),
                ({ $0.mergeable = .conflicting }, "Merge conflicts"),
                ({ $0.ciStatus = .failure }, "CI is red"),
                ({ $0.reviewThreads = [makeThread(comments: [makeComment("alice", "2026-08-02T10:00:00Z")])] }, "1 open thread"),
            ]
            for (override, reason) in blocked {
                let pr = mine {
                    $0.reviewDecision = .approved
                    $0.hasAutoMerge = true
                    override(&$0)
                }
                let result = classify(pr, context: ctx())
                #expect(result.category == .myPRAction)
                #expect(result.reason == reason)
            }
        }
    }

    @Suite("classify — snooze override") struct SnoozeOverride {
        @Test("demotes an attention PR to waiting while snoozed") func demotes() {
            let pr = makePullRequest { $0.buckets = [.reviewRequested] }
            let result = classify(pr, context: ctx(untilTime(snoozedAt: "2026-08-10T10:00:00Z", until: "2026-08-10T14:00:00Z")))
            #expect(result.category == .waiting)
            #expect(result.isSnoozed)
            #expect(result.reason == "Snoozed")
        }

        @Test("restores the PR once the snooze expires") func restores() {
            let pr = makePullRequest { $0.buckets = [.reviewRequested] }
            let result = classify(pr, context: ctx(untilTime(snoozedAt: "2026-08-10T08:00:00Z", until: "2026-08-10T09:00:00Z")))
            #expect(result.category == .needsReview)
            #expect(!result.isSnoozed)
        }

        @Test("keeps a hidden PR hidden rather than surfacing it as waiting") func keepsHidden() {
            let pr = makePullRequest { $0.isDraft = true; $0.buckets = [.reviewRequested] }
            let snoozes = untilTime(snoozedAt: "2026-08-10T10:00:00Z", until: "2026-08-10T14:00:00Z")
            #expect(classify(pr, context: ctx(snoozes)).category == .hidden)
        }
    }

    @Suite("classifyAll") struct ClassifyAll {
        @Test("drops hidden PRs and orders by category, then longest-waiting first") func dropsAndOrders() {
            let prs = [
                makePullRequest {
                    $0.id = "PR_waiting"; $0.authorLogin = me; $0.buckets = [.author]
                    $0.updatedAt = d("2026-08-09T10:00:00Z")
                },
                makePullRequest { $0.id = "PR_hidden"; $0.buckets = [.involves] },
                makePullRequest {
                    $0.id = "PR_fresh_request"; $0.buckets = [.reviewRequested]
                    $0.reviewRequestedAt = d("2026-08-09T10:00:00Z")
                },
                makePullRequest {
                    $0.id = "PR_stale_request"; $0.buckets = [.reviewRequested]
                    $0.reviewRequestedAt = d("2026-08-01T10:00:00Z")
                },
            ]
            let ids = classifyAll(prs, context: ctx()).map(\.pr.id)
            #expect(ids == ["PR_stale_request", "PR_fresh_request", "PR_waiting"])
        }

        @Test("puts the longest-waiting PR first even when it is the least recently active") func longestWaitingFirst() {
            let prs = [
                makePullRequest {
                    $0.id = "PR_chatty"; $0.buckets = [.reviewRequested]
                    $0.reviewRequestedAt = d("2026-08-09T10:00:00Z")
                    $0.updatedAt = d("2026-08-10T11:00:00Z")
                },
                makePullRequest {
                    $0.id = "PR_forgotten"; $0.buckets = [.reviewRequested]
                    // Predates the factory's createdAt, so it is clamped up to it.
                    $0.reviewRequestedAt = d("2026-07-27T10:00:00Z")
                    $0.updatedAt = d("2026-07-27T10:00:00Z")
                },
            ]
            #expect(classifyAll(prs, context: ctx()).map(\.pr.id) == ["PR_forgotten", "PR_chatty"])
        }

        @Test("still orders the waiting section newest-activity first") func waitingByRecency() {
            let prs = [
                makePullRequest {
                    $0.id = "PR_older"; $0.authorLogin = me; $0.buckets = [.author]
                    $0.updatedAt = d("2026-08-01T10:00:00Z")
                },
                makePullRequest {
                    $0.id = "PR_newer"; $0.authorLogin = me; $0.buckets = [.author]
                    $0.updatedAt = d("2026-08-09T10:00:00Z")
                },
            ]
            #expect(classifyAll(prs, context: ctx()).map(\.pr.id) == ["PR_newer", "PR_older"])
        }
    }

    @Suite("classify — waitingSince") struct WaitingSince {
        @Test("dates needs-review from the review request") func needsReviewFromRequest() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested]
                $0.reviewRequestedAt = d("2026-08-03T10:00:00Z")
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            #expect(classify(pr, context: ctx()).waitingSince == d("2026-08-03T10:00:00Z"))
        }

        @Test("falls back to the PR's creation when the request has no timestamp") func fallsBackToCreation() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested]
                $0.createdAt = d("2026-08-02T10:00:00Z")
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            #expect(classify(pr, context: ctx()).waitingSince == d("2026-08-02T10:00:00Z"))
        }

        @Test("dates new-replies from the oldest reply I owe") func newRepliesFromOldest() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviewThreads = [
                    repliedThread(id: "fresh", replyAt: "2026-08-10T11:00:00Z"),
                    repliedThread(id: "stale", replyAt: "2026-08-04T10:00:00Z"),
                ]
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .newReplies)
            #expect(result.waitingSince == d("2026-08-04T10:00:00Z"))
        }

        @Test("dates a re-review from the commit that invalidated my review") func reReviewFromCommit() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-01T10:00:00Z", state: .changesRequested)]
                $0.lastCommitPushedAt = d("2026-08-05T10:00:00Z")
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "New commits")
            #expect(result.waitingSince == d("2026-08-05T10:00:00Z"))
        }

        @Test("never dates new commits from before my review, even when the commit is backdated")
        func reReviewNotBeforeMyReview() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviews = [makeReview(me, "2026-08-05T10:00:00Z", state: .changesRequested, commitSHA: "reviewed")]
                $0.headSHA = "rebased"
                $0.lastCommitPushedAt = d("2026-08-03T10:00:00Z")
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "New commits")
            #expect(result.waitingSince == d("2026-08-05T10:00:00Z"))
        }

        @Test("ignores a review request that predates my own review") func ignoresStaleRequest() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested, .involves]
                $0.reviews = [makeReview(me, "2026-08-03T10:00:00Z", state: .approved)]
                $0.reviewRequestedAt = d("2026-08-01T10:00:00Z")
                $0.updatedAt = d("2026-08-09T10:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "Re-review requested")
            #expect(result.waitingSince == d("2026-08-09T10:00:00Z"))
        }

        @Test("dates a red CI from the PR itself when the commit predates it") func redCIClampedToCreation() {
            let pr = mine {
                $0.ciStatus = .failure
                $0.createdAt = d("2026-08-09T10:00:00Z")
                $0.lastCommitPushedAt = d("2026-07-01T10:00:00Z")
                $0.updatedAt = d("2026-08-09T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "CI is red")
            #expect(result.waitingSince == d("2026-08-09T10:00:00Z"))
        }

        @Test("dates changes-requested from the oldest request still standing") func changesFromOldestStanding() {
            let pr = mine {
                $0.reviewDecision = .changesRequested
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("alice", "2026-08-05T10:00:00Z", state: .changesRequested),
                    makeReview("alice", "2026-08-06T10:00:00Z", state: .approved),
                ]
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            #expect(classify(pr, context: ctx()).waitingSince == d("2026-08-02T10:00:00Z"))
        }

        @Test("dates two live change requests from the first of them") func twoLiveChangeRequests() {
            let pr = mine {
                $0.reviewDecision = .changesRequested
                $0.reviews = [
                    makeReview("bob", "2026-08-02T10:00:00Z", state: .changesRequested),
                    makeReview("alice", "2026-08-08T10:00:00Z", state: .changesRequested),
                ]
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            #expect(classify(pr, context: ctx()).waitingSince == d("2026-08-02T10:00:00Z"))
        }

        @Test("is not reset by a nudge in a thread I already owed an answer in") func notResetByNudge() {
            let pr = makePullRequest {
                $0.buckets = [.involves]
                $0.reviewThreads = [makeThread(comments: [
                    makeComment(me, "2026-08-01T10:00:00Z"),
                    makeComment("alice", "2026-08-02T10:00:00Z"),
                    makeComment("alice", "2026-08-10T11:00:00Z"),
                ])]
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .newReplies)
            #expect(result.waitingSince == d("2026-08-02T10:00:00Z"))
        }

        @Test("dates a mention from the first one I have not answered") func mentionFromFirstUnanswered() {
            let pr = makePullRequest {
                $0.buckets = [.mentions]
                $0.mentionsAt = [d("2026-08-02T10:00:00Z"), d("2026-08-10T11:00:00Z")]
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .mentioned)
            #expect(result.waitingSince == d("2026-08-02T10:00:00Z"))
        }

        @Test("skips mentions I answered and dates from the first one after") func skipsAnsweredMentions() {
            let pr = makePullRequest {
                $0.buckets = [.mentions]
                $0.mentionsAt = [d("2026-08-01T10:00:00Z"), d("2026-08-06T10:00:00Z"), d("2026-08-09T10:00:00Z")]
                $0.conversationComments = [makeComment(me, "2026-08-03T10:00:00Z")]
                $0.updatedAt = d("2026-08-09T10:00:00Z")
            }
            #expect(classify(pr, context: ctx()).waitingSince == d("2026-08-06T10:00:00Z"))
        }

        @Test("never dates a wait from before a draft became reviewable") func clampsToReadyForReview() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested]
                $0.createdAt = d("2026-07-25T10:00:00Z")
                $0.reviewRequestedAt = d("2026-07-25T11:00:00Z")
                $0.readyForReviewAt = d("2026-08-05T10:00:00Z")
                $0.updatedAt = d("2026-08-05T10:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .needsReview)
            #expect(result.waitingSince == d("2026-08-05T10:00:00Z"))
        }

        @Test("leaves a request that postdates the draft alone") func requestAfterDraft() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested]
                $0.createdAt = d("2026-07-25T10:00:00Z")
                $0.readyForReviewAt = d("2026-08-01T10:00:00Z")
                $0.reviewRequestedAt = d("2026-08-03T10:00:00Z")
            }
            #expect(classify(pr, context: ctx()).waitingSince == d("2026-08-03T10:00:00Z"))
        }

        @Test("dates ready-to-merge from the approval that unblocked it, not a later one") func readyFromFirstApproval() {
            let pr = mine {
                $0.reviewDecision = .approved
                $0.reviews = [
                    makeReview("alice", "2026-08-03T10:00:00Z", state: .approved),
                    makeReview("bob", "2026-08-09T10:00:00Z", state: .approved),
                ]
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "Ready to merge")
            #expect(result.waitingSince == d("2026-08-03T10:00:00Z"))
        }

        @Test("dates a re-review request from the request") func reReviewFromRequest() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested, .involves]
                $0.reviews = [makeReview(me, "2026-08-01T10:00:00Z", state: .changesRequested)]
                $0.reviewRequestedAt = d("2026-08-06T10:00:00Z")
                $0.lastCommitPushedAt = d("2026-07-30T10:00:00Z")
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "Re-review requested")
            #expect(result.waitingSince == d("2026-08-06T10:00:00Z"))
        }

        @Test("dates a mention from the mention") func mentionFromMention() {
            let pr = makePullRequest {
                $0.buckets = [.mentions]
                $0.mentionsAt = [d("2026-08-04T10:00:00Z")]
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.category == .mentioned)
            #expect(result.waitingSince == d("2026-08-04T10:00:00Z"))
        }

        @Test("dates changes-requested from the review that asked") func changesFromReview() {
            let pr = mine {
                $0.reviewDecision = .changesRequested
                $0.reviews = [makeReview("alice", "2026-08-03T10:00:00Z", state: .changesRequested)]
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            #expect(classify(pr, context: ctx()).waitingSince == d("2026-08-03T10:00:00Z"))
        }

        @Test("dates open threads on my PR from the oldest unanswered one") func openThreadsFromOldest() {
            let pr = mine {
                $0.reviewThreads = [
                    makeThread(id: "fresh", comments: [makeComment("alice", "2026-08-10T11:00:00Z")]),
                    makeThread(id: "stale", comments: [makeComment("bob", "2026-08-02T10:00:00Z")]),
                ]
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "2 open threads")
            #expect(result.waitingSince == d("2026-08-02T10:00:00Z"))
        }

        @Test("dates a red CI from the commit whose checks failed") func redCIFromCommit() {
            let pr = mine {
                $0.ciStatus = .failure
                $0.lastCommitPushedAt = d("2026-08-06T10:00:00Z")
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "CI is red")
            #expect(result.waitingSince == d("2026-08-06T10:00:00Z"))
        }

        @Test("dates ready-to-merge from the approval that unblocked it") func readyFromApproval() {
            let pr = mine {
                $0.reviewDecision = .approved
                $0.reviews = [makeReview("alice", "2026-08-07T10:00:00Z", state: .approved)]
                $0.updatedAt = d("2026-08-10T11:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "Ready to merge")
            #expect(result.waitingSince == d("2026-08-07T10:00:00Z"))
        }

        @Test("dates merge conflicts from the last activity, having no event to point at") func conflictsFromActivity() {
            let pr = mine {
                $0.mergeable = .conflicting
                $0.updatedAt = d("2026-08-08T10:00:00Z")
            }
            let result = classify(pr, context: ctx())
            #expect(result.reason == "Merge conflicts")
            #expect(result.waitingSince == d("2026-08-08T10:00:00Z"))
        }

        @Test("is null when nothing is waiting on me") func nilWhenNotMyMove() {
            let waiting = mine()
            #expect(classify(waiting, context: ctx()).category == .waiting)
            #expect(classify(waiting, context: ctx()).waitingSince == nil)

            let draft = makePullRequest { $0.isDraft = true; $0.buckets = [.reviewRequested] }
            #expect(classify(draft, context: ctx()).waitingSince == nil)
        }

        @Test("is null while snoozed, and comes back when the snooze lapses") func nilWhileSnoozed() {
            let pr = makePullRequest {
                $0.buckets = [.reviewRequested]
                $0.reviewRequestedAt = d("2026-08-01T10:00:00Z")
            }
            let snoozes = untilTime(snoozedAt: "2026-08-10T10:00:00Z", until: "2026-08-10T14:00:00Z")
            #expect(classify(pr, context: ctx(snoozes)).waitingSince == nil)

            let lapsed = untilTime(snoozedAt: "2026-08-10T10:00:00Z", until: "2026-08-10T11:00:00Z")
            #expect(classify(pr, context: ctx(lapsed)).waitingSince == d("2026-08-01T10:00:00Z"))
        }
    }

    @Suite("countAttention") struct CountAttention {
        @Test("counts everything except waiting") func countsAttention() {
            let items = classifyAll([
                makePullRequest { $0.id = "a"; $0.buckets = [.reviewRequested] },
                makePullRequest { $0.id = "b"; $0.authorLogin = me; $0.buckets = [.author] },
            ], context: ctx())
            #expect(countAttention(items) == 1)
        }
    }
}
