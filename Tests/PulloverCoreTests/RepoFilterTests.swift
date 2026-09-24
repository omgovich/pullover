import Testing
@testable import PulloverCore

private func pr(_ id: String, _ repository: String) -> PullRequest {
    makePullRequest { $0.id = id; $0.repository = repository }
}

@Suite struct RepoFilterTests {
    @Suite("collectRepositories") struct CollectRepositories {
        @Test("dedupes and sorts repository names") func dedupesAndSorts() {
            let prs = [pr("PR_1", "acme/web"), pr("PR_2", "acme/api"), pr("PR_3", "acme/web")]
            #expect(collectRepositories(prs) == ["acme/api", "acme/web"])
        }

        @Test("returns an empty array for no pull requests") func empty() {
            #expect(collectRepositories([]).isEmpty)
        }
    }

    @Suite("filterByRepositories") struct FilterByRepositories {
        let prs = [pr("PR_1", "acme/web"), pr("PR_2", "acme/api")]

        @Test("passes everything through when repositories is null") func nilPassesThrough() {
            #expect(filterByRepositories(prs, nil) == prs)
        }

        @Test("returns nothing when repositories is an empty array") func emptySelection() {
            #expect(filterByRepositories(prs, []).isEmpty)
        }

        @Test("keeps only pull requests in the selected repositories") func keepsSelected() {
            #expect(filterByRepositories(prs, ["acme/web"]).map(\.id) == ["PR_1"])
        }

        @Test("matches case-insensitively") func caseInsensitive() {
            #expect(filterByRepositories(prs, ["ACME/WEB"]).map(\.id) == ["PR_1"])
        }
    }

    @Suite("repositoryOptions") struct RepositoryOptions {
        @Test("lists the union of what was fetched and what is selected, sorted") func union() {
            #expect(repositoryOptions(known: ["acme/web", "acme/api"], selected: ["acme/infra"]) == [
                "acme/api", "acme/infra", "acme/web",
            ])
        }

        @Test("still counts a selected repository that has nothing open right now") func selectedOnly() {
            #expect(repositoryOptions(known: [], selected: ["acme/api"]) == ["acme/api"])
        }

        @Test("folds a name that differs only in case, keeping the prettier one") func foldsCase() {
            #expect(repositoryOptions(known: ["Acme/Web"], selected: ["acme/web"]) == ["Acme/Web"])
        }
    }

    @Suite("repositorySummary") struct RepositorySummary {
        @Test("says All when every repository is watched, whatever is ticked") func all() {
            #expect(repositorySummary(watchAll: true, known: ["acme/web"], selected: []) == "All")
        }

        @Test("counts the ticked ones against everything on offer") func counts() {
            #expect(repositorySummary(watchAll: false, known: ["acme/web", "acme/api"], selected: ["acme/api"]) == "1 of 2")
        }

        @Test("counts a selected repository that has nothing open right now") func selectedOnly() {
            #expect(repositorySummary(watchAll: false, known: [], selected: ["acme/api"]) == "1 of 1")
        }

        @Test("counts a selection saved twice, or in two casings, once") func duplicates() {
            #expect(repositorySummary(watchAll: false, known: [], selected: ["acme/api", "acme/api"]) == "1 of 1")
            #expect(repositorySummary(watchAll: false, known: ["Acme/API"], selected: ["acme/api", "ACME/Api"]) == "1 of 1")
        }
    }
}
