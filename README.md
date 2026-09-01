# Pullover

A menu-bar inbox for code review: it shows only the pull requests that currently need your action, and hides the ones where you're waiting on someone else.

## Install

Download the `.dmg` for your Mac from the [latest release](https://github.com/omgovich/pullover/releases/latest) — `arm64` for Apple Silicon, `x64` for Intel — and drag Pullover into Applications.

The builds aren't signed or notarized (there's no Apple Developer account behind the project yet), so macOS quarantines them on download. Clear the flag once and it launches normally from then on:

```bash
xattr -dr com.apple.quarantine /Applications/Pullover.app
```

Alternatively, launch it once, let macOS refuse, then approve it under System Settings → Privacy & Security → "Open Anyway".

Release builds ship with a built-in GitHub OAuth client ID, so you can skip straight to signing in. The OAuth App registration below is only needed when running from source.

## Running from source

### 1. Register a GitHub OAuth App

Pullover signs you in with GitHub's Device Flow, so it needs its own OAuth App. You only do this once, and it takes about two minutes.

1. Go to https://github.com/settings/developers and pick the **OAuth Apps** tab — not GitHub Apps, they're a different thing and won't work here.
2. Click **New OAuth App** and fill in:
   - **Application name** — `Pullover`
   - **Homepage URL** — anything valid; Device Flow never opens it.
   - **Application description** — optional, and it's what shows on the authorization screen. Suggested:

     > A menu-bar inbox that shows only the pull requests waiting on you, and hides the ones where you're waiting on someone else. Reads only — it never comments, reviews, or merges anything.

   - **Redirect URI** — unused by Device Flow. `http://localhost` if you want one at all. Leave **Allow wildcard matching** off.
3. Tick **Enable Device Flow**. Easy to miss, and without it sign-in fails with `unauthorized_client`.
4. Leave **Expire user access tokens** OFF. It hands out an 8-hour token plus a `refresh_token`, and Pullover doesn't implement refresh — you'd be silently signed out every few hours, and because the app doesn't tell a 401 apart from a network blip it would sit there showing a stale list and an error instead of sending you back to sign in.
5. Click **Register application**, then copy the **Client ID**. You don't need the client secret — Pullover is a public client and never asks for one.

### 2. Point Pullover at it

```bash
cp .env.example .env
```

Paste the Client ID into `MAIN_VITE_GITHUB_CLIENT_ID`. It's read at build time, so restart `npm run dev` after changing it.

### 3. Run it

```bash
npm install
npm run dev
```

Click the menu-bar item, hit **Sign in with GitHub**. Pullover shows you a short code, copies it to your clipboard and opens the browser — paste it, approve, and the window fills in. Then open **Settings** and add the repos you want watched, as `owner/repo`.

### About the permissions it asks for

At sign-in Pullover requests two scopes:

- **`repo`** — to read pull requests in private repositories. If everything you review is public, this is more than strictly needed, but GitHub has no narrower read-only scope that covers private PRs.
- **`read:org`** — so that review requests that reached you through a team, rather than by name, still show up.

Pullover only ever reads. It never writes a comment, review, or anything else — clicking a pull request opens it on github.com and you act there.

If a repo belongs to an organisation that restricts third-party OAuth Apps, its pull requests won't appear until an org owner approves Pullover under **Settings → Third-party Actions Access** for that org.

## Build

```bash
npm run dist
```

The build isn't signed, so clear the quarantine flag before the first launch (see [Install](#install)) if you move it out of `dist/`.

## Development

- `npm test` — unit tests (all the classification logic lives in `src/core/`)
- `npm run typecheck` — type checking

## Releasing

Releases are built by [release.yml](.github/workflows/release.yml). It needs the `PULLOVER_GITHUB_CLIENT_ID` repository variable (Settings → Secrets and variables → Actions → Variables) set to the client ID of the official Pullover OAuth App — it's baked into the binaries so they can sign in out of the box.

To cut a release: bump `version` in `package.json`, commit, then

```bash
git tag v0.1.0 && git push origin main --tags
```

CI builds arm64 and x64 dmgs and attaches them to a **draft** GitHub release — write the release notes and publish it.

## License

[MIT](LICENSE)
