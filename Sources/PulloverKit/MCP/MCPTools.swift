import Foundation
import PulloverCore

/// The JSON-RPC side of the MCP server: the handshake, the tool list and the
/// three tools. Tool descriptions are the API an agent reads, so they are
/// written for one.
@MainActor
public final class MCPTools {
    /// Newest first; a client asking for something else gets the newest.
    static let supportedProtocolVersions = ["2025-06-18", "2025-03-26", "2024-11-05"]

    private let inbox: Inbox
    private let store: AppStore
    private let version: String
    private let now: () -> Date

    public init(inbox: Inbox, store: AppStore, version: String, now: @escaping () -> Date = { Date() }) {
        self.inbox = inbox
        self.store = store
        self.version = version
        self.now = now
    }

    // MARK: JSON-RPC

    /// Answers one JSON-RPC message, or nil for a notification or a response.
    public func handle(_ message: JSONValue) async -> JSONValue? {
        guard case let .object(fields) = message else {
            return rpcError("Invalid Request", code: -32600)
        }
        let id = fields["id"]
        guard fields["jsonrpc"]?.stringValue == "2.0" else {
            return rpcError("Invalid Request: jsonrpc must be \"2.0\"", code: -32600, id: id ?? .null)
        }
        guard let method = fields["method"]?.stringValue else {
            // A response from the client, or garbage without an id: nothing to say.
            return id == nil ? nil : rpcError("Invalid Request", code: -32600, id: id ?? .null)
        }
        guard let id else { return nil }

        let params = fields["params"]?.objectValue ?? [:]
        switch method {
        case "initialize":
            let requested = params["protocolVersion"]?.stringValue
            let version = requested.flatMap { Self.supportedProtocolVersions.contains($0) ? $0 : nil }
                ?? Self.supportedProtocolVersions[0]
            return success(id, [
                "protocolVersion": .string(version),
                "capabilities": ["tools": ["listChanged": false]],
                "serverInfo": ["name": "pullover", "version": .string(self.version)],
            ])
        case "ping":
            return success(id, [:])
        case "tools/list":
            return success(id, ["tools": .array(Self.toolDefinitions)])
        case "tools/call":
            guard let name = params["name"]?.stringValue else {
                return rpcError("Invalid params: a tool name is required", code: -32602, id: id)
            }
            let arguments = params["arguments"]?.objectValue ?? [:]
            guard let result = await callTool(name, arguments: arguments) else {
                return rpcError("Unknown tool: \(name)", code: -32602, id: id)
            }
            return success(id, result)
        default:
            return rpcError("Method not found: \(method)", code: -32601, id: id)
        }
    }

    private func success(_ id: JSONValue, _ result: JSONValue) -> JSONValue {
        ["jsonrpc": "2.0", "id": id, "result": result]
    }

    // MARK: Tools

    private static let getInboxDescription = """
    Pullover's inbox: the open pull requests waiting on the user, grouped into sections by why they are waiting. Call it when the user asks what needs their attention on GitHub, what to review next, or whether anything is blocked on them.

    Each section is longest-waiting first — except "waiting", which has nobody waiting and is ordered by latest activity. Pullover refreshes from GitHub when its last fetch is over a minute old, so the list is current as of lastUpdatedAt. When notice is not null, the list is not the whole answer — signed out, a fetch that failed, a first one still running, or an organization that has not approved Pullover and whose pull requests are therefore missing from an otherwise current list — so relay the notice to the user.

    Categories, in the order the app shows them:
    - needs-review: somebody asked the user for review and they have not reviewed yet.
    - new-replies: somebody replied in a review thread the user took part in; the reason says how many.
    - re-review: the user reviewed already and the author pushed new commits or asked again.
    - my-pr-action: the user's own pull request needs them — changes requested, open threads, red CI, merge conflicts, or approved and ready to merge; the reason says which.
    - mentioned: the user was @-mentioned and has not responded since.
    - waiting: nothing is waiting on the user — it is on the author or on other reviewers, or it is snoozed; listed only when includeWaiting is true.

    Pullover reads GitHub; it never comments, reviews or merges. Act on a pull request with your own GitHub tooling — the `gh` CLI, say — at the url given.
    """

    private static let localNote =
        "This is a note inside Pullover on this Mac, visible to nobody else. GitHub is not touched: nothing is muted, closed or commented on there."

    private static let identifierProperties: [String: JSONValue] = [
        "repository": ["type": "string", "description": "Full name, owner/repo"],
        "number": ["type": "integer", "exclusiveMinimum": 0, "description": "The pull request number"],
    ]

    static let toolDefinitions: [JSONValue] = [
        [
            "name": "get_inbox",
            "title": "Pull requests waiting on the user",
            "description": .string(getInboxDescription),
            "inputSchema": [
                "type": "object",
                "properties": [
                    "includeWaiting": [
                        "type": "boolean",
                        "description": "Also list what is waiting on somebody else — the user's own pull requests out for review, ones where the ball is with the author, and anything snoozed. Default false.",
                    ],
                ],
                "additionalProperties": false,
            ],
            "annotations": ["readOnlyHint": true],
        ],
        [
            "name": "snooze_pull_request",
            "title": "Park a pull request in Pullover",
            "description": .string("Moves a pull request out of the attention sections into \"Waiting on others\", either for a number of hours or — with no hours — until it wakes on its own. With no hours it wakes on exactly two things: somebody replying in an unresolved review thread the user took part in, or a new commit. A new conversation comment, a fresh thread the user is not in, or a CI result does not wake it. Use it when the user asks to put something aside, not to tidy the list on your own: parking a pull request is deciding what they do not have to look at. Work you actually finish needs no snooze, because Pullover reclassifies a pull request by itself once the answer it was waiting for lands. Undo it with unsnooze_pull_request. \(localNote)"),
            "inputSchema": [
                "type": "object",
                "properties": .object(identifierProperties.merging([
                    "hours": [
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 336,
                        "description": "Whole hours to park it for, 1 to 336. A park with hours ends on the clock alone — a reply or a new commit does not cut it short. Leave it out and it is parked with no deadline instead, until one of those wakes it.",
                    ],
                ]) { a, _ in a }),
                "required": ["repository", "number"],
                "additionalProperties": false,
            ],
            // Not idempotent: a repeat moves the deadline, or re-bases the wait
            // on new activity, so a client must not retry it on its own.
            "annotations": ["readOnlyHint": false, "destructiveHint": false, "idempotentHint": false],
        ],
        [
            "name": "unsnooze_pull_request",
            "title": "Put a parked pull request back",
            "description": .string("Undoes snooze_pull_request, returning the pull request to whichever section its state calls for. \(localNote)"),
            "inputSchema": [
                "type": "object",
                "properties": .object(identifierProperties),
                "required": ["repository", "number"],
                "additionalProperties": false,
            ],
            "annotations": ["readOnlyHint": false, "destructiveHint": false, "idempotentHint": true],
        ],
    ]

    /// The tool's result, or nil when no tool has that name.
    func callTool(_ name: String, arguments: [String: JSONValue]) async -> JSONValue? {
        switch name {
        case "get_inbox":
            if let value = arguments["includeWaiting"], value.boolValue == nil, value != .null {
                return toolError("Invalid arguments: includeWaiting must be a boolean")
            }
            return await getInbox(includeWaiting: arguments["includeWaiting"]?.boolValue ?? false)
        case "snooze_pull_request":
            switch parseIdentifier(arguments) {
            case let .failure(message): return toolError(message)
            case let .success((repository, number)):
                var hours: Int?
                if let raw = arguments["hours"], raw != .null {
                    // The exact integer, so a huge or fractional number is refused rather than converted.
                    guard let value = raw.integerValue, (1...336).contains(value) else {
                        return toolError("Invalid arguments: hours must be a whole number from 1 to 336")
                    }
                    hours = Int(value)
                }
                return snooze(repository: repository, number: number, hours: hours)
            }
        case "unsnooze_pull_request":
            switch parseIdentifier(arguments) {
            case let .failure(message): return toolError(message)
            case let .success((repository, number)): return unsnooze(repository: repository, number: number)
            }
        default:
            return nil
        }
    }

    private enum Parsed<T> {
        case success(T)
        case failure(String)
    }

    private func parseIdentifier(_ arguments: [String: JSONValue]) -> Parsed<(String, Int)> {
        guard let repository = arguments["repository"]?.stringValue, !repository.isEmpty else {
            return .failure("Invalid arguments: repository is required, as owner/repo")
        }
        // `integerValue` is nil for `1e20` and the like, which `Int(_:)` would trap on.
        guard let raw = arguments["number"]?.integerValue, raw > 0, let number = Int(exactly: raw) else {
            return .failure("Invalid arguments: number is required, as a positive whole number")
        }
        return .success((repository, number))
    }

    private func getInbox(includeWaiting: Bool) async -> JSONValue {
        // A pass already running is the fresh answer on its way. A human sees a
        // spinner and waits; an agent would take the list it is about to
        // replace — or, at launch, an empty one — for the answer.
        await inbox.whenIdle()
        // Then the popup's own rule, so an agent and a click cost the same.
        if inbox.snapshot.shouldRefreshOnOpen(now: now()) {
            await inbox.refresh()
        }
        return toolResult(describeInbox(inbox.snapshot, includeWaiting: includeWaiting))
    }

    private func notFound(_ repository: String, _ number: Int) -> JSONValue {
        // Signed out, nothing is known, and pointing the agent at get_inbox
        // would send it looking for a list nobody has.
        toolError(inbox.snapshot.status == .signedOut
            ? "Pullover is signed out, so it knows no pull requests at all. Sign in from its menu-bar window first."
            : "Pullover does not know \(repository)#\(number). It only tracks open pull requests involving the signed-in user; call get_inbox first, which refreshes the list when it is stale.")
    }

    /// A pull request the classifier hides takes no snooze: `classify` returns
    /// before the snooze is consulted, so one written anyway would report no
    /// effect and then quietly take hold the day the pull request reappears.
    private func refusalIfHidden(_ item: ClassifiedPullRequest) -> JSONValue? {
        guard item.category == .hidden else { return nil }
        let name = "\(item.pr.repository)#\(item.pr.number)"
        return toolError(item.pr.isDraft
            ? "\(name) is a draft, and Pullover does not park drafts: they are out of the inbox already. It will appear once it is marked ready for review."
            : "\(name) is not in the inbox — nothing about it is waiting on the user — so there is nothing to park. Call get_inbox to see what is.")
    }

    private func reportAfterChange(_ repository: String, _ number: Int) -> JSONValue {
        inbox.reclassify()
        guard let item = inbox.findPullRequest(repository: repository, number: number) else {
            return notFound(repository, number)
        }
        return toolResult(describePullRequest(item))
    }

    private func snooze(repository: String, number: Int, hours: Int?) -> JSONValue {
        guard let item = inbox.findPullRequest(repository: repository, number: number) else {
            return notFound(repository, number)
        }
        if let refusal = refusalIfHidden(item) { return refusal }
        if let hours {
            store.snooze(item.pr.id, type: .untilTime, now: now(), hours: hours, headSHA: item.pr.headSHA)
        } else {
            store.snooze(item.pr.id, type: .untilActivity, now: now(), headSHA: item.pr.headSHA)
        }
        return reportAfterChange(repository, number)
    }

    /// No hidden check, unlike snoozing: a pull request that went to draft
    /// while parked still carries the snooze, and refusing here would leave it
    /// there to take hold the day it comes back.
    private func unsnooze(repository: String, number: Int) -> JSONValue {
        guard let item = inbox.findPullRequest(repository: repository, number: number) else {
            return notFound(repository, number)
        }
        store.unsnooze(item.pr.id)
        return reportAfterChange(repository, number)
    }

    private func toolResult<T: Encodable>(_ payload: T) -> JSONValue {
        let text = (try? ISODate.makeEncoder(pretty: true).encode(payload)).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
        let structured = (try? JSONValue.from(payload, encoder: ISODate.makeEncoder())) ?? [:]
        return ["content": [["type": "text", "text": .string(text)]], "structuredContent": structured]
    }

    private func toolError(_ message: String) -> JSONValue {
        ["content": [["type": "text", "text": .string(message)]], "isError": true]
    }
}
