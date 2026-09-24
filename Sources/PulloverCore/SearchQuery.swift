import Foundation

extension SearchBucket {
    var qualifier: String {
        switch self {
        case .reviewRequested: "review-requested:@me"
        case .author: "author:@me"
        case .involves: "involves:@me"
        case .mentions: "mentions:@me"
        }
    }
}

/// Splits `items` into groups of at most `size`.
public func chunk<T>(_ items: [T], size: Int) -> [[T]] {
    precondition(size > 0, "chunk size must be positive — got \(size)")
    return stride(from: 0, to: items.count, by: size).map { Array(items[$0..<min($0 + size, items.count)]) }
}

/// Always unfiltered by repository: the settings picker's own options come
/// from what an unfiltered search turns up.
///
/// Archived repositories are excluded — nothing there is ever anyone's move —
/// which also keeps them from eating slots in the 50-result cap. `excludeOrgs`
/// drops organizations that have not approved the OAuth app, since GitHub fails
/// the whole search rather than omitting them. Sorted by most recently updated
/// so the cap truncates predictably: the freshest activity survives.
public func buildSearchQuery(_ bucket: SearchBucket, excludeOrgs: [String] = []) -> String {
    (["is:pr", "is:open", "archived:false", bucket.qualifier, "sort:updated-desc"] + excludeOrgs.map { "-org:\($0)" })
        .joined(separator: " ")
}
