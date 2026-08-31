# Pullover

A menu-bar inbox for code review: it shows only the pull requests that
currently need your action, and hides the ones where you're waiting on
someone else.

## Setup

### 1. Register a GitHub OAuth App

Pullover signs you in with GitHub's Device Flow, so it needs its own OAuth App.
You only do this once, and it takes about two minutes.

1. Go to https://github.com/settings/developers and pick the **OAuth Apps**
   tab — not GitHub Apps, they're a different thing and won't work here.
2. Click **New OAuth App** and fill in:
   - **Application name** — `Pullover`
   - **Homepage URL** — anything valid; Device Flow never opens it.
     `https://github.com/omgovich/pullover` is fine.
   - **Authorization callback URL** — the form insists on one, but Device Flow
     never uses it. `http://localhost` is fine.
   - **Description** — optional.
3. Click **Register application**.
4. On the app's page, tick **Enable Device Flow** and click **Update
   application**. This is the step that's easy to miss — without it sign-in
   fails with `unauthorized_client`.
5. Copy the **Client ID**. You do *not* need the client secret; Pullover is a
   public client and never asks for one.

### 2. Point Pullover at it

```bash
cp .env.example .env
```

Paste the Client ID into `MAIN_VITE_GITHUB_CLIENT_ID`. It's read at build time,
so restart `npm run dev` after changing it.

### 3. Run it

```bash
npm install
npm run dev
```

Click the menu-bar item, hit **Sign in with GitHub**. Pullover shows you a
short code, copies it to your clipboard and opens the browser — paste it,
approve, and the window fills in. Then open **Settings** and add the repos you
want watched, as `owner/repo`.

### About the permissions it asks for

At sign-in Pullover requests two scopes:

- **`repo`** — to read pull requests in private repositories. If everything you
  review is public, this is more than strictly needed, but GitHub has no
  narrower read-only scope that covers private PRs.
- **`read:org`** — so that review requests that reached you through a team,
  rather than by name, still show up.

Pullover only ever reads. It never writes a comment, review, or anything else —
clicking a pull request opens it on github.com and you act there.

If a repo belongs to an organisation that restricts third-party OAuth Apps,
its pull requests won't appear until an org owner approves Pullover under
**Settings → Third-party Actions Access** for that org.

## Build

```bash
npm run dist
```

The build isn't signed, so on first launch: right-click the `.app` in
Finder → Open → Open.

## Development

- `npm test` — unit tests (all the classification logic lives in `src/core/`)
- `npm run typecheck` — type checking
