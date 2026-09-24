import Testing
@testable import PulloverCore

private func pr(
    _ id: String,
    head: String,
    base: String,
    repository: String = "acme/web",
    fromFork: Bool = false
) -> PullRequest {
    makePullRequest {
        $0.id = id
        $0.headRefName = head
        $0.baseRefName = base
        $0.repository = repository
        $0.isCrossRepository = fromFork
    }
}

/// Category and reason never matter to `orderSection` or `sectionRows`.
private func classified(_ id: String, _ stack: StackPosition?) -> ClassifiedPullRequest {
    ClassifiedPullRequest(
        pr: makePullRequest { $0.id = id },
        category: .needsReview,
        reason: "",
        waitingSince: nil,
        isSnoozed: false,
        stack: stack
    )
}

private func pos(_ id: String, _ index: Int, _ total: Int) -> StackPosition {
    StackPosition(id: id, index: index, total: total)
}

@Suite struct StackTests {
    @Suite("computeStackPositions") struct ComputeStackPositions {
        @Test("positions a real eight-deep stack from the owner's account") func eightDeep() {
            // Deliberately out of order and interleaved with an unrelated PR.
            let prs = [
                pr("PR_650", head: "text-search-e2e", base: "text-search-demo"),
                pr("PR_642", head: "text-search-controller", base: "text-search-matching"),
                pr("PR_643", head: "text-search-react-api", base: "text-search-options"),
                pr("PR_999", head: "unrelated-branch", base: "main"),
                pr("PR_641", head: "text-search-matching", base: "main"),
                pr("PR_648", head: "text-search-options", base: "text-search-perf"),
                pr("PR_644", head: "text-search-highlights", base: "text-search-react-api"),
                pr("PR_647", head: "text-search-perf", base: "text-search-controller"),
                pr("PR_645", head: "text-search-demo", base: "text-search-highlights"),
            ]

            let positions = computeStackPositions(prs)

            #expect(positions["PR_641"] == pos("PR_641", 1, 8))
            #expect(positions["PR_642"] == pos("PR_641", 2, 8))
            #expect(positions["PR_647"] == pos("PR_641", 3, 8))
            #expect(positions["PR_648"] == pos("PR_641", 4, 8))
            #expect(positions["PR_643"] == pos("PR_641", 5, 8))
            #expect(positions["PR_644"] == pos("PR_641", 6, 8))
            #expect(positions["PR_645"] == pos("PR_641", 7, 8))
            #expect(positions["PR_650"] == pos("PR_641", 8, 8))
            #expect(positions["PR_999"] == nil)
        }

        @Test("never makes a fork's PR the parent of PRs based on a same-named branch here") func forkHeadIsNotAParent() {
            // A contributor opened a PR from their fork's `main`; that branch is
            // not this repository's `main`, which PR_2 is based on.
            let prs = [
                pr("PR_fork", head: "main", base: "develop", fromFork: true),
                pr("PR_2", head: "feature-x", base: "main"),
            ]
            #expect(computeStackPositions(prs).isEmpty)
        }

        @Test("does not let a fork's PR fork an otherwise simple chain") func forkHeadDoesNotPoisonChain() {
            let prs = [
                pr("PR_1", head: "part-1", base: "main"),
                pr("PR_2", head: "part-2", base: "part-1"),
                pr("PR_fork", head: "part-1", base: "main", fromFork: true),
            ]
            let positions = computeStackPositions(prs)
            #expect(positions["PR_1"] == pos("PR_1", 1, 2))
            #expect(positions["PR_2"] == pos("PR_1", 2, 2))
            #expect(positions["PR_fork"] == nil)
        }

        @Test("still stacks a fork's PR on top of a branch that lives here") func forkPRCanBeAChild() {
            let prs = [
                pr("PR_1", head: "part-1", base: "main"),
                pr("PR_fork", head: "main", base: "part-1", fromFork: true),
            ]
            let positions = computeStackPositions(prs)
            #expect(positions["PR_1"] == pos("PR_1", 1, 2))
            #expect(positions["PR_fork"] == pos("PR_1", 2, 2))
        }

        @Test("gives no position to a lone pull request (chain of one)") func lone() {
            #expect(computeStackPositions([pr("PR_1", head: "feature-x", base: "main")]).isEmpty)
        }

        @Test("gives no position when a stack forks") func forks() {
            let positions = computeStackPositions([
                pr("PR_a", head: "x", base: "main"),
                pr("PR_b", head: "y1", base: "x"),
                pr("PR_c", head: "y2", base: "x"),
            ])
            #expect(positions["PR_a"] == nil)
            #expect(positions["PR_b"] == nil)
            #expect(positions["PR_c"] == nil)
        }

        @Test("withholds the whole component when a stack forks partway up") func forksPartway() {
            let positions = computeStackPositions([
                pr("PR_a", head: "a", base: "main"),
                pr("PR_b", head: "b", base: "a"),
                pr("PR_c", head: "c", base: "b"),
                pr("PR_d", head: "d", base: "c"),
                pr("PR_e", head: "e", base: "c"),
            ])
            for id in ["PR_a", "PR_b", "PR_c", "PR_d", "PR_e"] {
                #expect(positions[id] == nil)
            }
        }

        @Test("leaves a separate linear stack in the same repo untouched by a fork") func separateStackSurvivesFork() {
            let positions = computeStackPositions([
                pr("PR_a", head: "a", base: "main"),
                pr("PR_d", head: "d", base: "a"),
                pr("PR_e", head: "e", base: "a"),
                pr("PR_x", head: "x", base: "main"),
                pr("PR_y", head: "y", base: "x"),
            ])
            #expect(positions["PR_a"] == nil)
            #expect(positions["PR_x"] == pos("PR_x", 1, 2))
            #expect(positions["PR_y"] == pos("PR_x", 2, 2))
        }

        @Test("gives two separate stacks of equal length in one repository different ids") func distinctIds() throws {
            let positions = computeStackPositions([
                pr("PR_a1", head: "a1", base: "main"),
                pr("PR_a2", head: "a2", base: "a1"),
                pr("PR_b1", head: "b1", base: "main"),
                pr("PR_b2", head: "b2", base: "b1"),
            ])

            let stackA = try #require(positions["PR_a1"])
            let stackB = try #require(positions["PR_b1"])
            #expect(stackA.id != stackB.id)

            #expect(positions["PR_a2"]?.id == stackA.id)
            #expect(positions["PR_b2"]?.id == stackB.id)
        }

        @Test("gives no position when two pull requests share a headRefName") func sharedHead() {
            let positions = computeStackPositions([
                pr("PR_a", head: "dup", base: "main"),
                pr("PR_a2", head: "dup", base: "main"),
                pr("PR_b", head: "next", base: "dup"),
            ])
            #expect(positions["PR_a"] == nil)
            #expect(positions["PR_a2"] == nil)
            #expect(positions["PR_b"] == nil)
        }

        @Test("does not link two pull requests across different repositories that happen to share branch names")
        func acrossRepositories() {
            let positions = computeStackPositions([
                pr("PR_web_1", head: "x", base: "main", repository: "acme/web"),
                pr("PR_web_2", head: "y", base: "x", repository: "acme/web"),
                pr("PR_other_1", head: "x", base: "main", repository: "acme/other"),
            ])
            #expect(positions["PR_web_1"] == pos("PR_web_1", 1, 2))
            #expect(positions["PR_web_2"] == pos("PR_web_1", 2, 2))
            #expect(positions["PR_other_1"] == nil)
        }

        @Test("terminates and gives no position when the links form a cycle") func cycle() {
            let positions = computeStackPositions([
                pr("PR_a", head: "a", base: "c"),
                pr("PR_b", head: "b", base: "a"),
                pr("PR_c", head: "c", base: "b"),
            ])
            #expect(positions["PR_a"] == nil)
            #expect(positions["PR_b"] == nil)
            #expect(positions["PR_c"] == nil)
        }

        @Test("reads a partially-merged stack as the shorter remaining chain") func partiallyMerged() {
            let positions = computeStackPositions([
                pr("PR_642", head: "text-search-controller", base: "text-search-matching"),
                pr("PR_647", head: "text-search-perf", base: "text-search-controller"),
            ])
            #expect(positions["PR_642"] == pos("PR_642", 1, 2))
            #expect(positions["PR_647"] == pos("PR_642", 2, 2))
        }
    }

    @Suite("orderSection") struct OrderSection {
        @Test("leaves pull requests with no stack in place") func noStacks() {
            let items = [classified("PR_a", nil), classified("PR_b", nil), classified("PR_c", nil)]
            #expect(orderSection(items) == items)
        }

        @Test("gathers a stack's members into one contiguous run at the earliest member's position") func gathers() {
            let items = [
                classified("PR_2", pos("stack-1", 2, 3)),
                classified("PR_x", nil),
                classified("PR_1", pos("stack-1", 1, 3)),
                classified("PR_3", pos("stack-1", 3, 3)),
            ]
            #expect(orderSection(items).map(\.pr.id) == ["PR_1", "PR_2", "PR_3", "PR_x"])
        }

        @Test("keeps the incoming order between stacks and lets the earliest-appearing stack float up") func betweenStacks() {
            let items = [
                classified("PR_b1", pos("stack-b", 1, 2)),
                classified("PR_a2", pos("stack-a", 2, 2)),
                classified("PR_b2", pos("stack-b", 2, 2)),
                classified("PR_a1", pos("stack-a", 1, 2)),
            ]
            #expect(orderSection(items).map(\.pr.id) == ["PR_b1", "PR_b2", "PR_a1", "PR_a2"])
        }

        @Test("floats a stack to its longest-waiting member, chain order intact") func floatsStack() {
            func stacked(_ id: String, _ head: String, _ base: String, _ requestedAt: String) -> PullRequest {
                makePullRequest {
                    $0.id = id
                    $0.headRefName = head
                    $0.baseRefName = base
                    $0.buckets = [.reviewRequested]
                    $0.reviewRequestedAt = d(requestedAt)
                }
            }
            let prs = [
                stacked("PR_root", "part-1", "main", "2026-08-05T10:00:00Z"),
                stacked("PR_tip", "part-2", "part-1", "2026-08-02T10:00:00Z"),
                makePullRequest {
                    $0.id = "PR_lone"
                    $0.headRefName = "unrelated"
                    $0.buckets = [.reviewRequested]
                    $0.reviewRequestedAt = d("2026-08-04T10:00:00Z")
                },
            ]
            let stacks = computeStackPositions(prs)
            let context = ClassifyContext(myLogin: "vlad", now: d("2026-08-10T12:00:00Z"))
            let items = classifyAll(prs, context: context).map { item in
                var item = item
                item.stack = stacks[item.pr.id]
                return item
            }

            #expect(items.map(\.pr.id) == ["PR_tip", "PR_lone", "PR_root"])
            #expect(orderSection(items).map(\.pr.id) == ["PR_root", "PR_tip", "PR_lone"])
        }
    }

    @Suite("sectionRows") struct SectionRows {
        /// Each row as `id/above/below`: `L` a solid line to the neighbouring
        /// member, `:` dots over members that aren't shown but whose line the row
        /// beyond draws back towards, `~` a fade where the chain carries on past
        /// the list with nothing to meet, and `.` no line at all.
        func layoutOf(_ items: [ClassifiedPullRequest]) -> [String] {
            func mark(_ line: Bool, _ gap: Bool, _ open: Bool) -> String {
                line ? (gap ? (open ? "~" : ":") : "L") : "."
            }
            return sectionRows(items).map { row in
                "\(row.item.pr.id)/\(mark(row.lineAbove, row.gapAbove, row.gapAboveOpen))\(mark(row.lineBelow, row.gapBelow, row.gapBelowOpen))"
            }
        }

        func chain(_ indices: [Int], total: Int, id: String = "stack-1", prefix: String = "PR_") -> [ClassifiedPullRequest] {
            indices.map { classified("\(prefix)\($0)", pos(id, $0, total)) }
        }

        @Test("runs solid line through a full stack and stops at both ends") func fullStack() {
            #expect(layoutOf(chain([1, 2, 3, 4], total: 4)) == ["PR_1/.L", "PR_2/LL", "PR_3/LL", "PR_4/L."])
        }

        @Test("dots the segment where the middle of a stack is missing") func missingMiddle() {
            #expect(layoutOf(chain([1, 2, 4, 5], total: 5)) == ["PR_1/.L", "PR_2/L:", "PR_4/:L", "PR_5/L."])
        }

        @Test("fades upward from a stack that starts at 2") func startsAtTwo() {
            #expect(layoutOf(chain([2, 3], total: 4)) == ["PR_2/~L", "PR_3/L~"])
        }

        @Test("fades downward from a stack that ends before its top") func endsBeforeTop() {
            #expect(layoutOf(chain([1, 2], total: 4)) == ["PR_1/.L", "PR_2/L~"])
        }

        @Test("fades both sides of a lone member cut off at each end") func loneMember() {
            #expect(layoutOf([classified("PR_3", pos("stack-1", 3, 5))]) == ["PR_3/~~"])
        }

        @Test("draws nothing around a pull request with no stack") func noStack() {
            #expect(layoutOf([classified("PR_lone", nil)]) == ["PR_lone/.."])
        }

        @Test("draws no line between two whole stacks placed back to back") func backToBack() {
            let items = [
                classified("PR_a1", pos("stack-a", 1, 2)),
                classified("PR_a2", pos("stack-a", 2, 2)),
                classified("PR_b1", pos("stack-b", 1, 2)),
                classified("PR_b2", pos("stack-b", 2, 2)),
            ]
            #expect(layoutOf(items) == ["PR_a1/.L", "PR_a2/L.", "PR_b1/.L", "PR_b2/L."])
        }

        // Neighbouring rows draw the two halves of one segment, so a solid half
        // facing anything but a solid one would read as a line running between
        // unrelated pull requests.
        @Test("never faces a solid segment with a dotted, faded or absent one") func solidFacesSolid() {
            let rows = sectionRows(
                chain([1, 3, 4], total: 4, id: "stack-a", prefix: "A_")
                    + chain([2, 3], total: 3, id: "stack-b", prefix: "B_")
                    + [classified("LONE", nil), classified("C_1", pos("stack-c", 1, 2))]
            )
            for i in 0..<(rows.count - 1) {
                let solidBelow = rows[i].lineBelow && !rows[i].gapBelow
                let solidAbove = rows[i + 1].lineAbove && !rows[i + 1].gapAbove
                #expect(solidBelow == solidAbove)
            }
        }

        @Test("the worked example: a stack of 7 showing only 2, 3, 5, 6, 7") func workedExample() {
            #expect(layoutOf(chain([2, 3, 5, 6, 7], total: 7)) == ["PR_2/~L", "PR_3/L:", "PR_5/:L", "PR_6/LL", "PR_7/L."])
        }

        @Test("marks the ends of a stack as having nothing to meet") func endsOpen() {
            let rows = sectionRows(chain([2, 3, 5], total: 7))
            #expect(rows.map(\.gapAboveOpen) == [true, false, false])
            #expect(rows.map(\.gapBelowOpen) == [false, false, true])
        }

        @Test("treats an omission between two shown members as met on both sides") func omissionMet() {
            let rows = sectionRows(chain([1, 4], total: 4))
            #expect(rows.map { $0.gapBelowOpen || $0.gapAboveOpen } == [false, false])
        }

        @Test("has nothing to meet when the neighbouring row belongs to another stack") func otherStackNeighbour() {
            let rows = sectionRows([
                classified("PR_a1", pos("a", 1, 3)),
                classified("PR_b2", pos("b", 2, 2)),
            ])
            #expect(rows[0].gapBelowOpen)
            #expect(rows[1].gapAboveOpen)
        }

        @Test("has nothing to meet when the neighbouring row is in no stack at all") func noStackNeighbour() {
            let rows = sectionRows([
                classified("PR_lone", nil),
                classified("PR_m", pos("a", 2, 4)),
                classified("PR_other", nil),
            ])
            #expect(rows[1].gapAboveOpen)
            #expect(rows[1].gapBelowOpen)
        }

        @Test("keeps rows in the order given, so the keyboard cursor matches the screen") func keepsOrder() {
            let cases: [[ClassifiedPullRequest]] = [
                chain([1, 2, 3], total: 3, id: "s"),
                chain([2, 5, 6], total: 8, id: "s"),
                [classified("PR_x", nil), classified("PR_a2", pos("a", 2, 4)), classified("PR_y", nil)],
            ]
            for ordered in cases {
                #expect(sectionRows(ordered).map(\.item.pr.id) == ordered.map(\.pr.id))
            }
        }

        @Test("is unchanged by ordering an already-ordered section again") func idempotent() {
            let items = [
                classified("PR_b1", pos("b", 1, 2)),
                classified("PR_a2", pos("a", 2, 2)),
                classified("PR_a1", pos("a", 1, 2)),
                classified("PR_b2", pos("b", 2, 2)),
            ]
            let once = orderSection(items)
            #expect(orderSection(once).map(\.pr.id) == once.map(\.pr.id))
        }
    }
}
