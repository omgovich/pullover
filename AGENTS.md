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

How it works underneath: pushing a `v*` tag triggers `.github/workflows/release.yml`, which does everything in CI — the `build` job builds unsigned arm64 and x64 dmgs and attaches them to a **draft** GitHub release, then the `publish` job runs Claude to write user-facing notes from the commit log and publish the draft. The local agent's job is only what's before and after: pick the version, tag, watch the workflow, verify the result — and step in by hand if the `publish` job fails.

### Preconditions

1. Release from `main` only, clean and synced: `git switch main && git pull --ff-only origin main`. Never release from a feature branch or a dirty tree.
2. CI on the tip of `main` is green (`gh run list --branch main --limit 3`). If it's still running, wait for it (`gh run watch <id>`); if it's red, stop and report.
3. The `PULLOVER_GITHUB_CLIENT_ID` repository **variable** is set (`gh variable list`). Without it the release workflow fails by design — if it's missing, stop and ask the maintainer to register the OAuth App (README → "Register a GitHub OAuth App") and set the variable.
4. The `ANTHROPIC_API_KEY` repository **secret** is set (`gh secret list`) — the `publish` job needs it. If it's missing, you can still release: the workflow will build the draft and fail on the publish job, and you write the notes and publish by hand (step 6 below).

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

4. Watch the Release workflow to completion: `gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')`. On success CI has already written the notes and published the release — go to step 7.
5. If the **build** job failed: nothing public happened yet — fix the cause on `main`, delete the draft release (if any) and the tag (`gh release delete v<X.Y.Z> --yes`, `git push origin :refs/tags/v<X.Y.Z>`, `git tag -d v<X.Y.Z>`), and re-tag the same version. This is allowed **only** while the release was never published.
6. If only the **publish** job failed: the draft with the dmgs is fine — finish by hand. Verify the draft holds both dmgs (`Pullover-<X.Y.Z>-arm64.dmg`, `Pullover-<X.Y.Z>-x64.dmg`, each with a `.blockmap` sidecar), write the notes, and publish:

   ```bash
   gh release edit v<X.Y.Z> --notes-file <notes> --draft=false
   ```

   Notes are for users, not a commit dump: a flat bullet list, no headings — one short bullet per user-visible change, present tense, no hashes, no internal refactors unless the user can feel them. First release ever: a 2-3 sentence introduction of the app instead of a changelog.
7. Confirm `gh release view v<X.Y.Z>` shows it published with both dmgs, sanity-check the notes CI wrote, and report the release URL.

### Hard rules

- Never force-push `main`; never move, delete, or reuse a tag or release that has been **published**.
- Never edit a past release's assets; problems ship as the next version.
- Don't build release artifacts locally — users only get CI-built dmgs.
- Signing/notarization is intentionally off (no Apple Developer account). Don't enable the commented signing config in `electron-builder.yml` unless the maintainer asks and has provided the secrets it lists.
