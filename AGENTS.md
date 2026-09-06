# Pullover — agent guide

Pullover is a macOS menu-bar Electron app: an inbox that shows only the pull requests waiting on you. Main-process code in `src/main/`, pure classification logic (fully unit-tested) in `src/core/`, React UI in `src/renderer/`.

Commands:

- `npm run dev` — run the app locally (needs `.env`, see README)
- `npm test` — unit tests and screenshot tests
- `npm run test:visual` — screenshot tests alone
- `npm run typecheck` — type checking
- `npm run dist` — local build (`dist/*.dmg`); signed only if a Developer ID is in the keychain, never notarized — releases are signed and notarized in CI

Run `npm test` and `npm run typecheck` before committing. The screenshot tests need Chromium: `npx playwright install chromium`, once per machine.

Don't hard-wrap markdown files — one paragraph or list item per line.

## Comments

Keep them few. A comment earns its place only when the code cannot say the thing itself: a non-obvious *why*, a constraint from outside the file, a trap that looks like a mistake and isn't. Everything else is noise that goes stale.

Don't narrate what the next line does, don't restate a name, don't leave a header above every block, and don't explain a decision that the code and its test already make plain. Before writing one, try making the code say it instead — a better name or a small extraction usually wins.

When a comment is warranted, one or two sentences is the size. If it runs longer, the reasoning probably belongs in the commit message, which is where someone asking "why is this like this?" will actually look.

## Typography

Type sizes come from Reshaped — `Text`'s `variant`, or `var(--rs-font-size-*)` where a component writes its own `font-size` and takes no prop for it. Never a raw pixel value.

The scale is `body-1` `body-2` `caption-1` `caption-2`, plus `featured-*` and `headline-*`. Anything else silently does nothing: `Text` gives a variant it doesn't know no class at all, the text falls back to the inherited 16px, and neither typecheck nor lint objects.

## Screenshot tests

Every `*.screenshot.test.tsx` renders a component in a real Chromium through Vitest's browser mode and compares it against a committed PNG, once in each colour mode. `src/renderer/src/test/visual.tsx` holds the harness and the fixtures; a case is one `visualCase(name, ui)`.

The baselines are macOS/Chromium, which is why CI runs on `macos-15` — a Linux runner has none of the same fonts, so the comparison would be meaningless rather than merely strict. They are committed next to the tests so a change to them shows up as an image diff in the pull request.

When a change is meant to move pixels, re-record with `npm run test:visual -- -u` and read the PNGs in the diff before pushing. A red run writes the baseline, the render and the diff into `.vitest-attachments/`; CI uploads that as an artifact.

Two things a case must not depend on: the clock (pass the harness's `NOW`, never `new Date()`) and the network (`AVATAR_SRC` is inline). Animations are frozen at their first frame — see `src/renderer/src/test/visual.css` for why that is a stylesheet rather than `prefers-reduced-motion`.

## Releases

Everything happens in CI: pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds the dmgs into a draft GitHub release, writes the notes, and publishes it. To cut a release, from a clean synced `main`:

1. Bump `version` in `package.json` and commit as `Release v<X.Y.Z>`. Semver, judged by the commits since the last tag: user-visible change → minor, otherwise patch; a version named by the maintainer wins.
2. `git tag v<X.Y.Z> && git push origin main v<X.Y.Z>`.
3. Watch the run; when it's done, check the release looks right (`gh release view v<X.Y.Z>`) and report its URL.

If the run fails before anything was published, it's fine to delete the draft release and the tag, fix `main`, and re-tag the same version. Never move or reuse a tag or release that has been **published** — problems ship as the next version.
