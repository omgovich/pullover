import Testing
@testable import PulloverCore

@Suite struct SearchQueryTests {
    @Suite("chunk") struct Chunk {
        @Test("splits into groups of the given size") func splits() {
            #expect(chunk([1, 2, 3, 4, 5], size: 2) == [[1, 2], [3, 4], [5]])
        }

        @Test("returns an empty array for empty input") func empty() {
            #expect(chunk([Int](), size: 3).isEmpty)
        }

        @Test("throws instead of looping forever when size is zero") func zeroSize() async {
            await #expect(processExitsWith: .failure) {
                _ = chunk([1, 2, 3], size: 0)
            }
        }

        @Test("throws instead of looping forever when size is negative") func negativeSize() async {
            await #expect(processExitsWith: .failure) {
                _ = chunk([1, 2, 3], size: -1)
            }
        }
    }

    @Suite("buildSearchQuery") struct BuildSearchQuery {
        @Test("appends nothing when no organization is excluded") func noExclusions() {
            #expect(buildSearchQuery(.author, excludeOrgs: []) == "is:pr is:open archived:false author:@me sort:updated-desc")
            #expect(buildSearchQuery(.author) == buildSearchQuery(.author, excludeOrgs: []))
        }

        @Test("excludes each organization that has not approved the OAuth app") func excludesOrgs() {
            #expect(buildSearchQuery(.author, excludeOrgs: ["status-im", "acme"])
                == "is:pr is:open archived:false author:@me sort:updated-desc -org:status-im -org:acme")
        }

        @Test("builds an unscoped query with is:pr, is:open and the bucket qualifier") func unscoped() {
            #expect(buildSearchQuery(.reviewRequested) == "is:pr is:open archived:false review-requested:@me sort:updated-desc")
        }

        @Test("excludes archived repositories, which nothing can be done to") func excludesArchived() {
            for bucket in SearchBucket.allCases {
                #expect(buildSearchQuery(bucket).contains("archived:false"))
            }
        }

        @Test("maps every bucket to its own qualifier") func qualifiers() {
            #expect(buildSearchQuery(.author).contains("author:@me"))
            #expect(buildSearchQuery(.involves).contains("involves:@me"))
            #expect(buildSearchQuery(.mentions).contains("mentions:@me"))
        }

        @Test("sorts by most recently updated") func sortsByUpdated() {
            #expect(buildSearchQuery(.reviewRequested).contains("sort:updated-desc"))
        }

        @Test("never emits a repo: qualifier, for any bucket") func noRepoQualifier() {
            for bucket in SearchBucket.allCases {
                #expect(!buildSearchQuery(bucket).contains("repo:"))
            }
        }
    }
}
