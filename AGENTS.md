# Pullover — agent guide

Pullover is a macOS menu-bar Electron app: an inbox that shows only the pull requests waiting on you. Main-process code in `src/main/`, pure classification logic (fully unit-tested) in `src/core/`, React UI in `src/renderer/`.

Commands:

- `npm run dev` — run the app locally (needs `.env`, see README)
- `npm test` — unit tests
- `npm run typecheck` — type checking
- `npm run dist` — local build (`dist/*.dmg`); signed only if a Developer ID is in the keychain, never notarized — releases are signed and notarized in CI

Run `npm test` and `npm run typecheck` before committing.

Don't hard-wrap markdown files — one paragraph or list item per line.

## Comments

Keep them few. A comment earns its place only when the code cannot say the thing itself: a non-obvious *why*, a constraint from outside the file, a trap that looks like a mistake and isn't. Everything else is noise that goes stale.

Don't narrate what the next line does, don't restate a name, don't leave a header above every block, and don't explain a decision that the code and its test already make plain. Before writing one, try making the code say it instead — a better name or a small extraction usually wins.

When a comment is warranted, one or two sentences is the size. If it runs longer, the reasoning probably belongs in the commit message, which is where someone asking "why is this like this?" will actually look.

## Typography

Type sizes come from Reshaped, never from raw pixels. Normally that is `Text`'s `variant`; where a component writes its own `font-size` and takes no typography prop — `Avatar`'s initials are the one case — reach for `var(--rs-font-size-*)` and `var(--rs-line-height-*)` instead of a number.

The scale in the installed Reshaped (4.x) is `body-1` `body-2` `caption-1` `caption-2`. **The mockups are drawn against Reshaped v3.7, which numbers it one step differently** — v3.7's `body-3` is 14/20, which is `body-2` here. Translate before copying a name across.

Getting that wrong fails silently, which is why it is worth the paragraph: `Text` renders an unknown `variant` with no class at all, and its root is `font-size: inherit`, so the text lands on the inherited 16px rather than erroring. Nothing in the app sets a base size, and neither typecheck nor lint catches it — `variant` is typed loosely in the bundle entrypoint the app imports from.

## Releases

Everything happens in CI: pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds the dmgs into a draft GitHub release, writes the notes, and publishes it. To cut a release, from a clean synced `main`:

1. Bump `version` in `package.json` and commit as `Release v<X.Y.Z>`. Semver, judged by the commits since the last tag: user-visible change → minor, otherwise patch; a version named by the maintainer wins.
2. `git tag v<X.Y.Z> && git push origin main v<X.Y.Z>`.
3. Watch the run; when it's done, check the release looks right (`gh release view v<X.Y.Z>`) and report its URL.

If the run fails before anything was published, it's fine to delete the draft release and the tag, fix `main`, and re-tag the same version. Never move or reuse a tag or release that has been **published** — problems ship as the next version.
