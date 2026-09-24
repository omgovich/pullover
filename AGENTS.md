# Pullover (native) — agent guide

A macOS menu-bar app, in Swift: an inbox of the pull requests waiting on you. A rewrite of the Electron app at https://github.com/omgovich/pullover — its behaviour is the spec.

- `Sources/PulloverCore` — pure rules (classify, threads, stacks, snooze, format, agent view). No I/O, no clock: `now` is always passed in.
- `Sources/PulloverKit` — GitHub GraphQL, Device Flow, Keychain, `AppStore` (UserDefaults), the `Inbox` engine, the MCP server, the update check.
- `Sources/Pullover` — the app: `AppModel` (state and actions), `StatusItemController` (status item, popover, keys, menus), SwiftUI views.

Commands:

- `./scripts/test.sh` — all tests (Swift Testing). Run before committing.
- `swift run Pullover` — run from source (needs `PULLOVER_GITHUB_CLIENT_ID`); `PULLOVER_DEMO=1` for an invented inbox.
- `./scripts/snapshots.sh [dir]` — render the screens offscreen to PNGs; look at them after any UI change.
- `./scripts/bundle.sh` — `dist/Pullover.app`, zip and dmg.

Conventions:

- A rule change goes in `PulloverCore` with a test; views only display what the core decides.
- Interpolated numbers in SwiftUI go through `Text(verbatim:)` — `Text("#\(n)")` localises to `#2,184`.
- In the app target, `Category` and `Settings` are typealiased to PulloverCore's; AppKit and SwiftUI export their own.
- The MCP server listens on `7855` packaged and `7856` from source, on `127.0.0.1` only, and refuses foreign `Host`/`Origin`. Try it by hand:

```bash
curl -s -X POST http://127.0.0.1:7856/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Comments: few, and only for a non-obvious why. Don't hard-wrap markdown.
