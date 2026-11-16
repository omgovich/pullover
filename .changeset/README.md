# Changesets

Every PR that changes something a person running Pullover can see or feel adds a changeset:

```sh
npx changeset
```

Pick `minor` for a user-visible change and `patch` for a fix, then write one release note line: an emoji, the change in bold, and what it means for the user.

```md
🔔 **Mentions** — a pull request that mentions you now shows up even when you are not a reviewer.
```

Tests, CI, refactors and docs need no changeset.

On merge to `main`, a "Release" PR collects pending changesets, bumps the version and updates CHANGELOG.md. Merging that PR builds, signs and notarizes the app and publishes the GitHub release with those lines as its notes.
