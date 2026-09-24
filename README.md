<p align="center">
  <img src="docs/icon.png" width="140" alt="Pullover icon" />
</p>

<h1 align="center">Pullover</h1>

<p align="center"><b>Your code-review inbox, in the macOS menu bar.</b><br />Only the pull requests that need <i>you</i> — everything you're waiting on stays hidden.</p>

<p align="center">
  <img src="docs/screenshot-light.png" width="49%" alt="Pullover's popup in the light theme: pull requests grouped into 'Needs your review', 'Replies to you' and 'Take another look', each with the reason it needs you, and a stack drawn as a connected run" />
  <img src="docs/screenshot-dark.png" width="49%" alt="The same inbox in the dark theme and the compact layout" />
</p>

---

Pullover is a native macOS app, built with nothing but Apple's own tools: **Swift, SwiftUI and AppKit**, built with **Swift Package Manager**, with **zero third-party dependencies**. It started as an Electron + React app; the native rewrite keeps the same rules, screens and MCP server, and the download went from a 241 MB dmg to a 2.4 MB one. The app is about 4 MB installed and sits at around 50 MB of memory.

## ✨ Features

- 🎯 **Only what needs you.** Review requests, re-reviews, replies you owe, mentions — each PR sits under the reason it's there, longest wait first. The ones waiting on somebody else collapse into their own section.
- 🧑‍💻 **Your own PRs, too** — when there's something for you to do: changes requested, a comment you haven't answered, red CI, merge conflicts, or approved and ready to merge.
- 🔒 **Private repos and team requests.** If an organisation restricts OAuth Apps, its pull requests are left out and a notice names it; the list stays current for every organisation Pullover can see, rather than failing as a whole.
- 🧬 **Stacks stay together** — a stacked PR shows its place in the chain (`2/4`), drawn as one connected run, dotted where a member is hidden.
- 💤 **Snooze until new activity**, for 4 hours or until tomorrow, with Undo.
- 📌 **Lives in the menu bar** with a quiet count; no Dock icon.
- ⚡ **Global shortcut** — `⌃⌥P` by default — opens the inbox from anywhere.
- ⌨️ **Keyboard-driven** — `↑↓` move, `⏎` open, `S` snooze, `R` refresh, `M` menu, `esc` close.
- 🌗 **Light, dark, comfortable or compact.**
- 🚀 **Start at login**, via the system's own login items.
- 🤖 **MCP server** for Claude Code and other agents — see [MCP.md](MCP.md).
- 👀 **Read-only by design.** Pullover never comments, approves, or merges.

### Differences from the Electron version

- **Updates** are found, not installed: when a newer GitHub release exists, a *New version* button appears in the header and the status-item menu, and it opens the release page. Silent download-and-restart needs an update framework such as Sparkle, which this dependency-free port leaves out.
- **Long titles** are truncated with the full title on hover, rather than scrolling as a marquee on the selected row.
- **The popup** is a standard `NSPopover`, so it has the system's arrow and material rather than the original's custom card.

## 🧱 How it's built

| | Electron original | Native rewrite |
| --- | --- | --- |
| UI | React + Reshaped in a `BrowserWindow` | SwiftUI in an `NSPopover` off an `NSStatusItem` |
| GitHub | `@octokit/graphql` | `URLSession` + the same GraphQL queries |
| Sign-in | Device Flow over `fetch` | Device Flow over `URLSession` |
| Token storage | `safeStorage`-encrypted file | Keychain (`Security.framework`) |
| Settings & snoozes | `electron-store` JSON | `UserDefaults` |
| Global shortcut | `globalShortcut` | Carbon `RegisterEventHotKey` |
| Start at login | `app.setLoginItemSettings` | `SMAppService` |
| MCP server | `@modelcontextprotocol/sdk` on `node:http` | Hand-written Streamable HTTP JSON-RPC on `Network.framework` |
| Updates | `electron-updater` (download + restart) | GitHub Releases check → "New version" button opens the release |
| Tests | Vitest | Swift Testing |

The app is three targets, each with a test target beside the first two:

- **`PulloverCore`** — the pure rules, ported one-to-one: classification, thread analysis, stacks, snoozes, formatting, the agent view. No I/O, no clock, no AppKit; this is where the unit tests concentrate.
- **`PulloverKit`** — GitHub (search → details, batching, retries, org-restriction salvage, rate limits), Device Flow, Keychain, the settings store, the `Inbox` engine (one pass at a time, a single queued follow-up), the MCP server and the update check.
- **`Pullover`** — the menu-bar app: status item, popover, hotkey, and the SwiftUI views.

## 🛠️ Building

Requirements: macOS 14+ and Swift 6 — the Xcode Command Line Tools are enough, full Xcode is not needed.

### 1. Register a GitHub OAuth App

Pullover signs in with GitHub's Device Flow, so it needs an OAuth App (not a GitHub App). At https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**: any homepage URL, tick **Enable Device Flow**, leave **Expire user access tokens** off, and copy the **Client ID**. No client secret is needed.

### 2. Run it

```bash
export PULLOVER_GITHUB_CLIENT_ID=your-client-id
```

```bash
swift run Pullover
```

A run from source calls itself *Pullover Dev*: it keeps its own settings and Keychain item, and serves MCP on port `7856`, so it never collides with an installed copy.

To try the interface without a GitHub account, run it on an invented inbox:

```bash
PULLOVER_DEMO=1 swift run Pullover
```

### 3. Build the app

```bash
PULLOVER_GITHUB_CLIENT_ID=your-client-id ./scripts/bundle.sh
```

This writes `dist/Pullover.app`, `dist/Pullover-<version>.zip` and `dist/Pullover-<version>.dmg`. It is signed ad hoc unless `SIGN_IDENTITY` names a Developer ID, in which case it is signed with the hardened runtime, ready for `notarytool`. `UNIVERSAL=1` builds for Apple Silicon and Intel together (that one needs full Xcode). The version comes from `VERSION`. Set `PULLOVER_UPDATE_REPOSITORY=owner/repo` to have the app check that repository's GitHub releases for newer versions; without it, no update check runs.

### Development

- `./scripts/test.sh` — the whole test suite. It is `swift test` plus the search paths Swift Testing needs when only the Command Line Tools are installed.
- `./scripts/snapshots.sh [dir]` — renders the demo inbox's screens (inbox, dark + compact, settings, repositories) to PNGs offscreen; that is how the pictures above were made.
- CI (`.github/workflows/ci.yml`) runs the tests and uploads a bundle, built with the `PULLOVER_GITHUB_CLIENT_ID` repository variable — set it, or the uploaded app can't sign in.
- Logs go to the unified log under the `Pullover` subsystem: `log stream --predicate 'subsystem == "Pullover"'`.

## 🔐 Privacy

No backend, no analytics, no telemetry. The app talks to GitHub's API and nothing else — plus, if the build was given an update repository, that repository's GitHub releases. The token lives in your login Keychain. Sign-in asks for `repo` and `read:org`, the narrowest scopes that can see pull requests in private repositories and team review requests. The only thing Pullover writes is its own settings and snooze list, on your Mac. The optional MCP server is off until you turn it on, and listens on `127.0.0.1` only.

## 📄 License

MIT — see [LICENSE](LICENSE). Built by [Vlad Shilov](https://github.com/omgovich).
