import Foundation
import PulloverCore
import PulloverKit

/// An invented inbox for screenshots and trying the interface without a
/// GitHub account: `PULLOVER_DEMO=1`. Built as raw pull requests rather than
/// finished rows, so everything shown is something `classify` really produces.
enum DemoInbox {
    static var isEnabled: Bool { ProcessInfo.processInfo.environment["PULLOVER_DEMO"] == "1" }

    static let me = "vlad"

    struct Client: GraphQLClient {
        func execute(_ query: String, variables: [String: JSONValue]) async throws -> Data {
            throw GitHubError.malformed("The demo inbox never talks to GitHub")
        }
    }

    static func seedSnoozes(_ store: AppStore, now: Date) {
        store.snooze("demo-310", type: .untilTime, now: now, hours: 24)
    }

    static func pullRequests(now: Date) -> [PullRequest] {
        func ago(_ minutes: Double) -> Date { now.addingTimeInterval(-minutes * 60) }
        let h = 60.0

        func avatar(_ login: String) -> String {
            "https://api.dicebear.com/9.x/notionists/png?seed=\(login)&backgroundColor=c0aede,ffdfbf,d1d4f9,ffd5dc,a7e0a0"
        }

        func pr(
            _ number: Int, _ repo: String, _ title: String, by author: String,
            _ additions: Int, _ deletions: Int, ci: CIStatus = .success,
            head: String? = nil, base: String = "main",
            configure: (inout PullRequest) -> Void = { _ in }
        ) -> PullRequest {
            var pr = PullRequest(
                id: "demo-\(number)", number: number, title: title,
                url: "https://github.com/\(repo)/pull/\(number)", repository: repo,
                authorLogin: author, authorAvatarURL: avatar(author),
                createdAt: ago(3 * 24 * h), updatedAt: ago(30),
                additions: additions, deletions: deletions,
                headRefName: head ?? "branch-\(number)", baseRefName: base,
                ciStatus: ci, lastCommitPushedAt: ago(2 * 24 * h)
            )
            configure(&pr)
            return pr
        }

        func thread(_ id: String, _ comments: [(String, Double)]) -> ReviewThread {
            ReviewThread(id: id, comments: comments.map { ThreadComment(authorLogin: $0.0, createdAt: ago($0.1)) })
        }

        return [
            pr(482, "acme/billing", "Proration on upgrades", by: "sdiaz", 733, 214, ci: .pending) {
                $0.buckets = [.reviewRequested]
                $0.reviewRequestedAt = ago(6 * h)
            },
            pr(2184, "acme/dashboard", "Lazy-load the preview pane", by: "kirill", 412, 96) {
                $0.buckets = [.reviewRequested]
                $0.reviewRequestedAt = ago(40)
            },
            pr(2188, "acme/dashboard", "Filter chips wrap oddly", by: "mira", 87, 31) {
                $0.buckets = [.involves]
                $0.reviewThreads = [
                    thread("t1", [(me, 20 * h), ("mira", 9 * h)]),
                    thread("t2", [(me, 20 * h), ("mira", 8 * h)]),
                    thread("t3", [(me, 20 * h), ("mira", 2 * h)]),
                ]
            },
            pr(476, "acme/billing", "Checkout: cart model", by: "mira", 218, 140, head: "checkout-cart") {
                $0.buckets = [.reviewRequested]
                $0.reviews = [Review(authorLogin: me, state: .commented, submittedAt: ago(20 * h))]
                $0.reviewRequestedAt = ago(5 * h)
            },
            pr(478, "acme/billing", "Checkout: line items", by: "tpark", 96, 18, head: "checkout-lines", base: "checkout-cart") {
                $0.buckets = [.involves]
                $0.reviews = [Review(authorLogin: me, state: .approved, submittedAt: ago(20 * h))]
                $0.lastCommitPushedAt = ago(7 * h)
            },
            // Third in the stack, but nothing about it is waiting on anyone
            // here: hidden, which is what leaves the dotted gap in the chain.
            pr(477, "acme/billing", "Checkout: totals", by: "sdiaz", 120, 30, head: "checkout-totals", base: "checkout-lines") {
                $0.buckets = [.involves]
            },
            pr(480, "acme/billing", "Checkout: promo field", by: "kirill", 41, 9, head: "checkout-promo", base: "checkout-totals") {
                $0.buckets = [.involves]
                $0.reviews = [Review(authorLogin: me, state: .commented, submittedAt: ago(20 * h))]
                $0.lastCommitPushedAt = ago(9 * h)
            },
            pr(2179, "acme/dashboard", "Empty state for saved views", by: me, 234, 4) {
                $0.buckets = [.author]
                $0.reviewThreads = [thread("t4", [("kirill", 10 * h)]), thread("t5", [("mira", 4 * h)])]
            },
            pr(318, "acme/mobile", "Offline mode for the inbox", by: me, 573, 24, ci: .failure) {
                $0.buckets = [.author]
                $0.lastCommitPushedAt = ago(3 * h)
            },
            pr(479, "acme/billing", "Refund flow copy", by: "sdiaz", 6, 6, ci: .none) {
                $0.buckets = [.mentions]
                $0.mentionsAt = [ago(7 * h)]
            },
            pr(2150, "acme/dashboard", "Drop the print stylesheet", by: me, 12, 304) {
                $0.buckets = [.author]
                $0.updatedAt = ago(90)
            },
            pr(310, "acme/mobile", "Bump the icon set to v2", by: "tpark", 8, 8) {
                $0.buckets = [.reviewRequested]
                $0.updatedAt = ago(6 * h)
            },
        ]
    }
}
