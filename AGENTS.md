# Working on Pullover

Pullover is a macOS menu-bar app that shows a developer only the GitHub pull requests waiting on
them, and hides the ones where they are waiting on somebody else. Electron + React + Reshaped,
TypeScript throughout.

## Layout

| Directory | Owns | May not import |
| --- | --- | --- |
| `src/core/` | Pure decision logic — classification, snoozes, formatting, GraphQL mapping | React, Electron, clocks, network |
| `src/main/` | I/O — GitHub API, OAuth, storage, tray, window, IPC handlers | React |
| `src/shared/` | The contract between processes: domain types and IPC channel names | Anything with a runtime dependency |
| `src/renderer/` | React UI over one `InboxSnapshot` pushed from main | Electron directly (use `window.api`) |

`src/core` staying pure is why it carries almost all the tests. If a change tempts you to import
React or Electron there, the logic belongs somewhere else.

## Rules that hold the product together

- **Resolved review threads are invisible to every rule.** `unresolvedThreads` in
  `src/core/threads.ts` is the single place that filter happens. `hasParticipated` is the one
  sanctioned exception — commenting in a thread counts as participation even after it is resolved.
- **The classifier assigns exactly one category, first match wins**, and the order is a product
  decision. Changing it changes what the user sees.
- **Timestamps are ISO 8601 UTC strings compared as strings.** `compareIso` in
  `src/core/threads.ts` is the only comparator. Never parse them into `Date` to order them.
- **A snoozed pull request is re-evaluated on every poll**, not parked. When its wake condition
  fires it returns to whichever category it belongs to on the merits, not the one it left.
- **The search always runs unfiltered.** The repository selection is a display filter applied
  after fetching, which is what lets the settings picker offer every repo you are involved in.

## Conventions

- **Reach for a Reshaped component before writing CSS.** When a design value is close to a token
  but not identical, take the token — a pixel or two does not justify a custom rule.
  `src/renderer/src/pullover.css` holds only what no prop can express, and should not grow.
- Reshaped's numeric `size`, `width`, `gap` and `padding` are **multiples of a 4px unit, not
  pixels**. `size={14}` is 56px. This has shipped a bug before.
- User-facing text is English, informal, and lives next to the code that renders it.
- Comments state constraints the code cannot express. They do not narrate what was tried, explain
  a library's internals, or record the history of the file.

## Before you call anything done

```bash
npm test          # 190 tests
npm run typecheck
npm run build
```

Tests are the safety net for every refactor. Do not edit a test to make a change pass — if you
want to, the behaviour changed and that needs saying out loud. New behaviour needs a test that
fails without it; prove it by breaking the implementation and watching the test go red.

This environment usually has no GUI, so visual claims cannot be verified from here. Say what you
checked and what you did not.

## Releasing

Releases are cut by hand from a Mac, because building a macOS app needs one. An agent may run the
whole procedure without asking, provided the preconditions hold.

### Preconditions

- On `main`, working tree clean, in sync with `origin/main`
- `npm test`, `npm run typecheck` and `npm run build` all clean
- `.env` present with `MAIN_VITE_GITHUB_CLIENT_ID` set — see the note below

### Version

Semantic versioning against the previous tag. Pre-1.0, that means a patch bump for fixes and a
minor bump for anything a user would notice. The tag is the `package.json` version prefixed with
`v`; the two must never disagree.

### Steps

```bash
# 1. Bump the version in package.json, then:
git commit -am "Release v0.2.0"

# 2. Build from a clean dist — stale artifacts from older names linger otherwise
rm -rf dist
npm run dist

# 3. Confirm the artifact exists and carries the new version
ls dist/Pullover-0.2.0-arm64.dmg

# 4. Tag and push
git tag -a v0.2.0 -m "v0.2.0"
git push origin main --follow-tags

# 5. Publish, letting GitHub write the notes from the commits
gh release create v0.2.0 \
  --title "v0.2.0" \
  --generate-notes \
  --notes-start-tag v0.1.0 \
  "dist/Pullover-0.2.0-arm64.dmg"
```

Then append the Gatekeeper note to the release body, because the build is unsigned and the first
launch fails confusingly without it:

> The build is not signed, so on first launch: right-click **Pullover.app** in Finder → Open →
> Open.

### Things that will bite you

- **The build is unsigned** (`identity: null` in `electron-builder.yml`). Every release needs the
  Gatekeeper note above. Do not add signing configuration without being asked — it needs a paid
  Apple Developer account.
- **The artifact is architecture-specific**, named for whatever Mac built it. Releasing from an
  Apple Silicon machine produces `-arm64` only; Intel Macs will not run it. If a universal build
  is ever wanted, that is a change to `electron-builder.yml`, not something to improvise at
  release time.
- **The OAuth client ID is baked in at build time** by Vite, from `.env`. A release built without
  `.env` produces a binary whose sign-in fails with a configuration error. Embedding it is correct
  and safe: Device Flow clients are public by design and there is no secret involved — do not
  strip it, and do not treat it as a leak.
- **Never move a published tag.** If a release is wrong, cut the next patch version.
- `dist/` is git-ignored; the DMG reaches users through the GitHub release, not the repository.
