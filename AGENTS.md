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

Releases are agent-driven, end to end. When asked to cut a release, follow this playbook without pausing for step-by-step approval — the request itself is the approval. Stop only when a check below fails, and report what failed.

How it works underneath: pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds unsigned arm64 and x64 dmgs and attaches them to a **draft** GitHub release. The agent's job is everything around that: pick the version, tag, watch the build, write the notes, publish.

### Preconditions

1. Release from `main` only, clean and synced: `git switch main && git pull --ff-only origin main`. Never release from a feature branch or a dirty tree.
2. CI on the tip of `main` is green (`gh run list --branch main --limit 3`). If it's still running, wait for it (`gh run watch <id>`); if it's red, stop and report.
3. The `PULLOVER_GITHUB_CLIENT_ID` repository **variable** is set (`gh variable list`). Without it the release workflow fails by design — if it's missing, stop and ask the maintainer to register the OAuth App (README → "Register a GitHub OAuth App") and set the variable.

### Picking the version

Semver, judged from the commits since the last tag (`git log "$(git describe --tags --abbrev=0)..HEAD" --oneline`):

- any user-visible feature or behavior change → **minor**
- only fixes, internal refactors, docs, CI → **patch**
- **major** only when the maintainer explicitly says so

If the maintainer names a version, that wins. First release ever (no tags yet): use the version already in `package.json`.

### Steps

1. Bump `version` in `package.json` (the only place the version lives; the lockfile self-updates on the next install, don't touch it by hand).
2. Commit as `Release v<X.Y.Z>` and push to `main`.
3. Tag and push the tag:

   ```bash
   git tag v<X.Y.Z> && git push origin v<X.Y.Z>
   ```

4. Watch the Release workflow to completion: `gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
5. If the workflow **failed**: nothing public happened yet — fix the cause on `main`, delete the draft release (if any) and the tag (`gh release delete v<X.Y.Z> --yes`, `git push origin :refs/tags/v<X.Y.Z>`, `git tag -d v<X.Y.Z>`), and re-tag the same version. This is allowed **only** while the release was never published.
6. On success, verify the draft release holds both dmgs (`Pullover-<X.Y.Z>-arm64.dmg`, `Pullover-<X.Y.Z>-x64.dmg`, each with a `.blockmap` sidecar): `gh release view v<X.Y.Z>`.
7. Write the release notes and publish:

   ```bash
   gh release edit v<X.Y.Z> --notes-file <notes> --draft=false
   ```

   Notes are for users, not a commit dump: a few bullets under **Features** and **Fixes**, present tense, no hashes, no internal refactors unless the user can feel them. Skip a heading with nothing under it.
8. Confirm `gh release view v<X.Y.Z>` shows it published, and report the release URL.

### Hard rules

- Never force-push `main`; never move, delete, or reuse a tag or release that has been **published**.
- Never edit a past release's assets; problems ship as the next version.
- Don't build release artifacts locally — users only get CI-built dmgs.
- Signing/notarization is intentionally off (no Apple Developer account). Don't enable the commented signing config in `electron-builder.yml` unless the maintainer asks and has provided the secrets it lists.
