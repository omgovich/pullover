# Pullover

A menu-bar inbox for code review: it shows only the pull requests that
currently need your action, and hides the ones where you're waiting on
someone else.

## Setup

1. Register an OAuth App at https://github.com/settings/developers
   and turn on **Device Flow**.
2. Copy `.env.example` to `.env` and paste in the Client ID.
3. `npm install`
4. `npm run dev`

## Build

```bash
npm run dist
```

The build isn't signed, so on first launch: right-click the `.app` in
Finder → Open → Open.

## Development

- `npm test` — unit tests (all the classification logic lives in `src/core/`)
- `npm run typecheck` — type checking
