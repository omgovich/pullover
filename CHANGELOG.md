# pullover

## 0.19.1

- 📦 **Smaller app** — Pullover takes about 90 MB less on disk, and the download is 18 MB lighter.

## 0.19.0

- 🚦 **Merge queue** — a pull request that is already in the merge queue no longer shows up in your inbox, and it comes back on the next refresh if the queue drops it.

## 0.18.0

- 📚 **Bigger inboxes** — Pullover now reads up to 200 of the most recently updated pull requests per search instead of stopping at 50, so busy accounts no longer lose older pull requests from the list.
- 🧩 **Partial inbox warning** — when GitHub's search is cut short (too many results, low API quota, or an organization that hasn't approved Pullover), the header says some pull requests may be missing, and an empty list reads "Partial inbox" instead of "Inbox zero".
- ⏱️ **Stuck refreshes** — a GitHub request that never answered could leave the inbox refreshing forever; it now times out and retries.

## 0.17.0

- 🥞 **Stack numbering that matches GitHub** — a pull request in a GitHub stack now keeps its real position, so the ninth of sixteen still reads `9/16` after the first eight merge instead of restarting at `1/8`.

## 0.16.0

- 💬 **New comments on your pull requests** — when someone leaves a general comment or a commented review on a pull request you opened, it now shows up in your inbox as "New comments" until you reply or push; bots are ignored, and the reason can be switched off in settings.
- 🕒 **New commits dated by when they were pushed** — a commit written before your review but pushed after it is now flagged as new commits, instead of being missed because of its older commit date.

## 0.15.0

- 🎚️ **Choose your reasons** — a new Reasons screen in settings lets you switch off any reason a pull request lands in your inbox, such as new commits or red CI; a pull request with that reason off moves to Waiting on others unless something else still needs you.

## 0.14.0

- 🏢 **Organizations that haven't approved Pullover** — if one of your GitHub organizations restricts OAuth app access, the rest of your inbox now still loads instead of the whole fetch failing, with a warning naming the organization whose pull requests are missing; agents using the MCP server get the same warning.

## 0.13.0

- 🤖 **Agents can read your inbox** — a new MCP server, off until you switch it on in Settings, lets Claude Code and other local clients ask what is waiting on you and why. It sees the same classified inbox the window shows and needs no extra GitHub token. Setup is in [MCP.md](https://github.com/omgovich/pullover/blob/v0.13.0/MCP.md).
- 💤 **Agents can park a pull request** — an agent can snooze one until tomorrow and bring it back, exactly as the context menu does, so "put everything from that repo aside for now" stops being a click-by-click chore.
- 🗂️ **Settings redrawn as rows** — the panel reads as a tidy list instead of a stack of controls, and repositories get a screen of their own rather than an expanding box in the middle of everything else.
- 🎨 **Appearance switch lands on its option** — the highlighted pill no longer sits a little off the setting you picked.

## 0.12.0

- 🪟 **Stays on your Space** — opening the popup no longer pulls you away to whichever desktop or fullscreen app you last used it on; it appears where you already are, and leaves with that Space when you switch.

## 0.11.0

- 🩹 **Refreshes that failed on a big inbox** — details are fetched in smaller batches and asked for again when GitHub's side gives up, so a refresh that used to end in an error now finishes.
- 💬 **Readable errors** — a failed refresh now says one plain line in the header, like "Couldn't reach GitHub — HTTP 502", instead of the raw response, and a long message stays on its line rather than crowding the buttons out of the way.
- ♻️ **No refresh spent twice** — opening the popup while a refresh is already running no longer fires a second identical one at your GitHub quota.

## 0.10.0

- 🔢 **Quieter menu bar** — the icon now stands alone when nothing is waiting on you, instead of spelling out "No PRs" next to it; a count appears only when there is something to count.
- 📏 **Ruled-off sections** — lines now run the full width of the window between the sections, and the space around a collapsed one is even on both sides.
- 🧘 **Roomier inbox zero** — with nothing left to review, the empty state fills the window rather than sitting in a band at the top.

## 0.9.0

- ⏳ **Sorted by how long it has been waiting on you** — each section now puts the longest-waiting pull request first, and every card shows `waiting 3h` instead of when the thread was last touched, so the top row says why it is the top row.
- ☁️ **A failed refresh no longer looks like an empty inbox** — when Pullover cannot reach GitHub, the empty state shows a CloudOff icon rather than implying there is nothing waiting on you.

## 0.8.0

- 🖱️ **Right-click menu** — right-click a pull request, or press <kbd>M</kbd> on the selected one, to open it, jump to its files, copy its link or branch name, or snooze it.
- 📐 **Comfortable rows are two lines** — the comfortable layout is now the meta line over the same title-and-status row compact uses, so a card takes less room with nothing dropped. The snooze pill gives way to a `…` button that opens the same menu.
- 🎞️ **Long titles scroll** — a title too wide for its row fades at the edges and scrolls end to end while the row is under the cursor, instead of stopping at an ellipsis.
- 🏷️ **Shorter repository names** — the owner is dropped from the repository name in the list, and shows in the row's tooltip instead.
- 🔤 **Settings text is no longer oversized** — text in the settings panel and the repository picker was rendering larger than anything else in the app.

## 0.7.0

- 📋 **Compact layout** — a new setting puts each pull request on a single row, so a full inbox fits on screen without scrolling. Pick it under Layout in Settings.
- 🧊 **Archived repositories** — pull requests in archived repos no longer sit in your inbox waiting for a review nobody needs.
- 🔀 **Merge conflicts** — your own pull request now shows up when it has conflicts, instead of quietly staying out of the inbox while it waits on you.
- ✅ **Auto-merge** — an approved pull request with auto-merge armed leaves the inbox; there is nothing left for you to do on it.

## 0.6.1

- 📜 **Scrollable settings** — the settings panel no longer cuts off its lower sections when it outgrows the window; the whole panel scrolls, so the repository list keeps its full height and every option stays reachable.

## 0.6.0

- ⌨️ **Global shortcut** — ⌃⌥P opens the popup from whatever app you are in. Settings let you switch it to ⌃⌥R or ⌃⌘P, or turn it off, and tell you when another app has already claimed the combination.

## 0.5.2

- ⌨️ **Esc is listed with the other shortcuts** — the keyboard row at the bottom of the inbox now shows that Esc closes the window, next to Move, Review, Snooze and Refresh.

## 0.5.1

- ⚠️ **Sign in once after updating** — the app's internal name changed, and macOS keys the encrypted token to that name, so the stored one can't be read back. Your settings, repository selection and snoozes all carry over; only the GitHub sign-in has to be redone.
- 🧪 **A dev build no longer disturbs the installed app** — running Pullover from source used to share the installed app's settings, token and keychain entry, which could sign you out of the real app and set off repeated macOS keychain password prompts. The two are now separate.

## 0.5.0

- 🚀 **Start at login** — a switch in Settings has macOS launch Pullover when you sign in, so the inbox is already watching without you remembering to open it. Nothing appears on screen; it just joins the menu bar.
- ⏳ **Rate limits** — hitting GitHub's rate limit no longer shows a raw API error and keeps retrying into a wall. Pullover says the limit is reached, tells you how long until it lifts, and waits that long before trying again.
- 💚 **Settings footer** — the footer is now properly set off from the settings above it, with links to the source and a Sponsor button.

## 0.4.0

- 🔄 **Automatic updates** — Pullover now checks for new releases on its own and downloads them quietly in the background. When one is ready, a "New version" button appears in the header and a restart line at the top of the menu-bar menu; nothing installs until you restart, either by clicking through or by quitting the app as usual. This is the last version you have to download by hand.

## 0.3.0

- 🔏 **Signed and notarized** — Pullover now carries a Developer ID signature and an Apple notarization ticket, so macOS just opens it. No more clearing the quarantine flag by hand after every download.

## 0.2.0

- 🧬 **Stacks read as one thing** — a stacked pull request shows its position in the chain (`4/8`) next to the number, and the whole stack stays visible as a single connected run even when your repository filter would hide part of it.
- 🗂️ **A repository picker that survives long lists** — settings is rebuilt around a filterable picker, so choosing what the inbox watches no longer means scrolling past every repo you have ever touched.
- ⚡ **Faster refreshes** — search buckets and pull-request detail batches are fetched at the same time instead of one after another.
- 🔑 **A dead token signs you out** — a revoked or expired GitHub token returns you to the sign-in screen, instead of leaving a stale list sitting behind a permanent error.
- 🔀 **A proper menu-bar glyph** — the tray item is a pull-request icon, and the top of its menu tells you what the inbox is doing right now.
- 🛟 **Crashes stay visible** — a failure in the interface shows an error card with a reload button, rather than making the window silently disappear.
- ⎋ **Esc closes the popup.**
- 🔄 **The spinner tells the truth** — it follows the actual refresh state, so it no longer sticks or lags behind.

## 0.1.0

🧶 **The first release of Pullover** — a macOS menu-bar inbox for code review.

It shows only the pull requests that currently need your action: review requests, re-reviews after new commits, unanswered comments, mentions, and your own PRs when they're blocked on you. Everything you're waiting on someone else for stays hidden. Read-only by design — it never comments, approves, or merges anything on your behalf.

**Install:** download the `.dmg` for your Mac (`arm64` for Apple Silicon, `x64` for Intel). This build is unsigned, so clear the quarantine flag once after installing:

```
xattr -dr com.apple.quarantine /Applications/Pullover.app
```

> Releases from **v0.3.0** onward are signed and notarized, and need none of this — grab the [latest release](https://github.com/omgovich/pullover/releases/latest) instead unless you specifically want this version.
