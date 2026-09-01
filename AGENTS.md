# Pullover — agent guide

Pullover is a macOS menu-bar Electron app: an inbox that shows only the pull requests waiting on you. Main-process code in `src/main/`, pure classification logic (fully unit-tested) in `src/core/`, React UI in `src/renderer/`.

Commands:

- `npm run dev` — run the app locally (needs `.env`, see README)
- `npm test` — unit tests
- `npm run typecheck` — type checking
- `npm run dist` — local unsigned build (`dist/*.dmg`)

Run `npm test` and `npm run typecheck` before committing.

Don't hard-wrap markdown files — one paragraph or list item per line.

## Releases

Cutting a release is agent-driven — the request itself is the approval, don't pause for step-by-step confirmation. The heavy lifting happens in CI: pushing a `v*` tag triggers `.github/workflows/release.yml`, whose `build` job attaches unsigned arm64/x64 dmgs to a draft GitHub release and whose `publish` job has Claude write the notes and publish it. Locally:

1. Get on a clean, synced `main` (`git switch main && git pull --ff-only`) with green CI. Never release from a feature branch or a dirty tree.
2. Pick the version — semver, judged from `git log "$(git describe --tags --abbrev=0)..HEAD" --oneline`: any user-visible change → minor, otherwise patch, major only when the maintainer says so. A version named by the maintainer wins. First release ever: keep what's already in `package.json`.
3. Bump `version` in `package.json` (the only place it lives), commit as `Release v<X.Y.Z>`, push.
4. `git tag v<X.Y.Z> && git push origin v<X.Y.Z>`, then watch the run: `gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')`. Missing repo config (`PULLOVER_GITHUB_CLIENT_ID` variable, `ANTHROPIC_API_KEY` secret) fails the workflow with a self-explanatory error — relay it to the maintainer.
5. When it's green, sanity-check the result (`gh release view v<X.Y.Z>`: published, both dmgs, sane notes) and report the release URL.

If the workflow fails:

- **`build` job failed** — nothing is public yet: fix the cause on `main`, delete the draft and the tag (`gh release delete v<X.Y.Z> --yes`, `git push origin :refs/tags/v<X.Y.Z>`, `git tag -d v<X.Y.Z>`), re-tag the same version. Allowed only while the release was never published.
- **`publish` job failed** — the draft with the dmgs is fine, finish by hand: check both dmgs are attached, write the notes (flat bullet list, one short bullet per user-visible change, present tense, no hashes, no internals; first release — a 2-3 sentence intro of the app instead), then `gh release edit v<X.Y.Z> --notes-file <notes> --draft=false`.

Hard rules: never force-push `main` or move/delete/reuse a **published** tag or release — problems ship as the next version. Users only get CI-built dmgs, don't hand them local builds. Signing/notarization is intentionally off; don't enable the commented config in `electron-builder.yml` unless the maintainer asks and has provided the secrets it lists.
