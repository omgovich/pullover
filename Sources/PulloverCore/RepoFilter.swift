import Foundation

/// Every repository present in the fetched pull requests, unique and sorted.
public func collectRepositories(_ prs: [PullRequest]) -> [String] {
    Array(Set(prs.map(\.repository))).sorted()
}

/// Narrows to the selected repositories; nil means no narrowing. Comparison is
/// case-insensitive because stored names are lowercased while GitHub returns
/// them in their original case.
public func filterByRepositories(_ prs: [PullRequest], _ repositories: [String]?) -> [PullRequest] {
    guard let repositories else { return prs }
    let wanted = Set(repositories.map { $0.lowercased() })
    return prs.filter { wanted.contains($0.repository.lowercased()) }
}

/// The repositories the picker offers: everything seen in the fetch, plus
/// everything already selected — a selected repository with nothing open right
/// now must still be listed. Duplicates fold case-insensitively and the
/// prettier casing (GitHub's, seen first) wins.
public func repositoryOptions(known: [String], selected: [String]) -> [String] {
    var byLower: [String: String] = [:]
    for repo in known + selected where byLower[repo.lowercased()] == nil {
        byLower[repo.lowercased()] = repo
    }
    return byLower.values.sorted { $0.localizedCompare($1) == .orderedAscending }
}

/// What the Repositories row shows: how many offered repositories are ticked,
/// or that all of them are watched. Divides by the same union the picker
/// lists, so it cannot read "1 of 0"; counts selections folded the same way,
/// so duplicate or case-variant entries an older build saved cannot read "2 of 1".
public func repositorySummary(watchAll: Bool, known: [String], selected: [String]) -> String {
    if watchAll { return "All" }
    let options = repositoryOptions(known: known, selected: selected)
    let ticked = Set(selected.map { $0.lowercased() })
    let tickedCount = options.filter { ticked.contains($0.lowercased()) }.count
    return "\(tickedCount) of \(options.count)"
}
