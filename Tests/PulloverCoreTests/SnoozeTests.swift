import Testing
@testable import PulloverCore

private let now = d("2026-08-10T12:00:00Z")

@Suite struct SnoozeTests {
    @Suite("isSnoozeActive — until-time") struct UntilTime {
        let snooze = Snooze(prId: "PR_1", type: .untilTime, snoozedAt: d("2026-08-10T10:00:00Z"), until: d("2026-08-10T14:00:00Z"))

        @Test("is active before the deadline") func activeBeforeDeadline() {
            #expect(isSnoozeActive(makePullRequest(), snooze, myLogin: me, now: now))
        }

        @Test("expires at the deadline") func expiresAtDeadline() {
            #expect(!isSnoozeActive(makePullRequest(), snooze, myLogin: me, now: d("2026-08-10T14:00:00Z")))
        }

        @Test("is inactive when `until` is missing") func missingUntil() {
            var broken = snooze
            broken.until = nil
            #expect(!isSnoozeActive(makePullRequest(), broken, myLogin: me, now: now))
        }
    }

    @Suite("isSnoozeActive — until-activity") struct UntilActivity {
        let snooze = Snooze(prId: "PR_1", type: .untilActivity, snoozedAt: d("2026-08-10T10:00:00Z"))

        @Test("stays asleep when nothing happened") func nothingHappened() {
            let pr = makePullRequest { $0.lastCommitPushedAt = d("2026-08-09T10:00:00Z") }
            #expect(isSnoozeActive(pr, snooze, myLogin: me, now: now))
        }

        @Test("wakes on a reply from someone else in a thread I am in") func wakesOnReply() {
            let pr = makePullRequest {
                $0.lastCommitPushedAt = d("2026-08-09T10:00:00Z")
                $0.reviewThreads = [makeThread(comments: [
                    makeComment(me, "2026-08-09T10:00:00Z"),
                    makeComment("alice", "2026-08-10T11:00:00Z"),
                ])]
            }
            #expect(!isSnoozeActive(pr, snooze, myLogin: me, now: now))
        }

        @Test("wakes on a commit newer than the snooze") func wakesOnCommit() {
            let pr = makePullRequest { $0.lastCommitPushedAt = d("2026-08-10T11:00:00Z") }
            #expect(!isSnoozeActive(pr, snooze, myLogin: me, now: now))
        }

        @Test("wakes on a push whose commit is dated before the snooze") func wakesOnBackdatedPush() {
            // A rebase or cherry-pick keeps the commit's original date.
            var recorded = snooze
            recorded.headSHA = "aaa111"
            let pr = makePullRequest {
                $0.headSHA = "bbb222"
                $0.lastCommitPushedAt = d("2026-08-09T10:00:00Z")
            }
            #expect(!isSnoozeActive(pr, recorded, myLogin: me, now: now))
        }

        @Test("stays asleep while the head is the one it was snoozed on") func sameHead() {
            var recorded = snooze
            recorded.headSHA = "aaa111"
            let pr = makePullRequest {
                $0.headSHA = "aaa111"
                // Only possible with a clock-skewed committer; the SHA settles it.
                $0.lastCommitPushedAt = d("2026-08-10T11:00:00Z")
            }
            #expect(isSnoozeActive(pr, recorded, myLogin: me, now: now))
        }

        @Test("falls back to the commit date for a snooze saved without a head") func legacySnooze() {
            let pr = makePullRequest {
                $0.headSHA = "bbb222"
                $0.lastCommitPushedAt = d("2026-08-09T10:00:00Z")
            }
            #expect(isSnoozeActive(pr, snooze, myLogin: me, now: now))
        }

        @Test("stays asleep when the only new comment is my own") func ownComment() {
            let pr = makePullRequest {
                $0.lastCommitPushedAt = d("2026-08-09T10:00:00Z")
                $0.reviewThreads = [makeThread(comments: [
                    makeComment(me, "2026-08-09T10:00:00Z"),
                    makeComment(me, "2026-08-10T11:00:00Z"),
                ])]
            }
            #expect(isSnoozeActive(pr, snooze, myLogin: me, now: now))
        }

        @Test("stays asleep when the reply landed in a resolved thread") func resolvedThread() {
            let pr = makePullRequest {
                $0.lastCommitPushedAt = d("2026-08-09T10:00:00Z")
                $0.reviewThreads = [makeThread(isResolved: true, comments: [
                    makeComment(me, "2026-08-09T10:00:00Z"),
                    makeComment("alice", "2026-08-10T11:00:00Z"),
                ])]
            }
            #expect(isSnoozeActive(pr, snooze, myLogin: me, now: now))
        }

        @Test("stays asleep when the newest commit exactly equals snoozedAt") func commitAtSnooze() {
            let pr = makePullRequest { $0.lastCommitPushedAt = d("2026-08-10T10:00:00Z") }
            #expect(isSnoozeActive(pr, snooze, myLogin: me, now: now))
        }
    }

    // "treats a type no longer in the union as expired" is not ported: `SnoozeType`
    // is a closed enum, so an unknown persisted type fails to decode instead.
}
