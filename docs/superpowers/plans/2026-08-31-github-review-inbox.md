# GitHub Review Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS menu-bar Electron app that shows only the GitHub pull requests that currently need the user's action, hiding the ones where the user is waiting on somebody else.

**Architecture:** All decision logic lives in `src/core/` as pure functions with no Electron or network imports — this is where the "whose ball is it" classifier lives, and it is unit-tested exhaustively. The Electron main process owns I/O (GitHub GraphQL, OAuth, disk storage, tray) and feeds the classifier. The React renderer is a dumb view over a single `InboxSnapshot` object pushed from main over typed IPC.

**Tech Stack:** Electron 44, electron-vite 5, React 19, Reshaped 4.1 (UI kit), TypeScript 7, Vitest 4, electron-store 11, `@octokit/graphql` 9, electron-builder 26.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-08-31-github-review-inbox-design.md`. Read it before Task 1.
- macOS only. Node 22+. ESM throughout (`"type": "module"` in `package.json`).
- Default poll interval is **5 minutes**, user-configurable. A manual refresh button always exists.
- **Resolved review threads are ignored completely.** No rule anywhere may read a thread with `isResolved: true`.
- No native OS notifications anywhere. The only "something is new" signal is the menu-bar badge.
- Only `github.com`. No Enterprise hosts, no multi-account.
- UI text is in Russian (matches the spec's category names).
- All timestamps are ISO 8601 UTC strings (GitHub's format, e.g. `2026-08-31T10:00:00Z`) and are compared with plain string comparison, which is correct for that format. Never parse them into `Date` for ordering.
- Path aliases `@shared/*` → `src/shared/*` and `@core/*` → `src/core/*` are configured in `tsconfig.json`, `electron.vite.config.ts`, and `vitest.config.ts`. Use them instead of deep relative imports.
- Every task ends with a commit. Run `npm test` and `npm run typecheck` before each commit.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/shared/types.ts` | Domain types shared by main and renderer. No logic. |
| `src/shared/ipc.ts` | IPC channel names and the `RendererApi` contract. |
| `src/core/threads.ts` | Predicates over review threads and reviews. Pure. |
| `src/core/snooze.ts` | Whether a snooze is still active. Pure. |
| `src/core/classify.ts` | The classifier: PR + context → category + reason. Pure. |
| `src/core/search-query.ts` | Builds GitHub search query strings. Pure. |
| `src/core/map-pr.ts` | GraphQL response node → `PullRequest`. Pure. |
| `src/main/store.ts` | Persisted settings, snoozes, seen marks. |
| `src/main/auth/token-storage.ts` | Token encryption via `safeStorage`. |
| `src/main/auth/device-flow.ts` | OAuth Device Flow against github.com. |
| `src/main/github/queries.ts` | GraphQL documents. |
| `src/main/github/fetch-prs.ts` | Search → dedupe → batch detail fetch. |
| `src/main/inbox.ts` | Snapshot state, poll timer, refresh orchestration. |
| `src/main/window.ts` | Popup BrowserWindow lifecycle and positioning. |
| `src/main/tray.ts` | Tray item and badge count. |
| `src/main/ipc.ts` | Registers IPC handlers over `Inbox` and the store. |
| `src/main/index.ts` | App entry; wires everything together. |
| `src/preload/index.ts` | `contextBridge` exposure of `RendererApi`. |
| `src/renderer/src/App.tsx` | Routes between sign-in, inbox, and settings. |
| `src/renderer/src/components/*` | Presentational components. |

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Test: `src/core/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run dev`, `npm test`, `npm run typecheck`; the alias config every later task relies on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "github-review-inbox",
  "version": "0.1.0",
  "description": "Menu-bar inbox for GitHub code review",
  "main": "./out/main/index.js",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "npm run build && electron-builder --mac"
  },
  "dependencies": {
    "@octokit/graphql": "^9.0.5",
    "electron-store": "^11.0.2",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "reshaped": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.0",
    "electron": "^44.0.0",
    "electron-builder": "^26.15.3",
    "electron-vite": "^5.0.0",
    "typescript": "^7.0.2",
    "vite": "^7.0.0",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without `ERESOLVE` errors; `node_modules/` exists.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["node", "vite/client"],
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@core/*": ["src/core/*"]
    }
  },
  "include": ["src/**/*", "*.config.ts"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@core': resolve(import.meta.dirname, 'src/core'),
}

export default defineConfig({
  main: { resolve: { alias }, plugins: [externalizeDepsPlugin()] },
  preload: { resolve: { alias }, plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
})
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@core': resolve(import.meta.dirname, 'src/core'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 6: Create `.gitignore` and `.env.example`**

`.gitignore`:

```
node_modules/
out/
dist/
.env
.DS_Store
```

`.env.example`:

```
# Register an OAuth App at https://github.com/settings/developers
# and enable "Device Flow" on it. Copy the Client ID here into a .env file.
MAIN_VITE_GITHUB_CLIENT_ID=
```

- [ ] **Step 7: Write the smoke test**

Create `src/core/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 8: Run the smoke test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 9: Create the minimal Electron entry points**

`src/main/index.ts`:

```ts
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 420,
    height: 640,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>GitHub Review Inbox</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/renderer/src/App.tsx`:

```tsx
export default function App(): React.JSX.Element {
  return <h1>GitHub Review Inbox</h1>
}
```

- [ ] **Step 10: Verify the app boots**

Run: `npm run dev`
Expected: an Electron window opens showing "GitHub Review Inbox". Quit with Ctrl+C.

- [ ] **Step 11: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + vitest project"
```

---

### Task 2: Domain types and thread predicates

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/core/threads.ts`
- Test: `src/core/threads.test.ts`
- Delete: `src/core/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type in `@shared/types` (used by all later tasks), plus these predicates from `@core/threads`:
  - `lastComment(thread: ReviewThread): ThreadComment | null`
  - `unresolvedThreads(pr: PullRequest): ReviewThread[]`
  - `threadsAwaitingMyReply(pr: PullRequest, myLogin: string): ReviewThread[]`
  - `unansweredThreads(pr: PullRequest, myLogin: string): ReviewThread[]`
  - `myLatestReview(pr: PullRequest, myLogin: string): Review | null`
  - `hasParticipated(pr: PullRequest, myLogin: string): boolean`
  - `hasNewReplyInMyThreadsSince(pr: PullRequest, myLogin: string, since: string): boolean`
  - `makePullRequest(overrides?: Partial<PullRequest>): PullRequest` (test factory, exported from `src/core/threads.test.ts`'s sibling — see Step 2)

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
export type CiStatus = 'success' | 'failure' | 'pending' | 'none'

export type SearchBucket = 'review-requested' | 'author' | 'involves' | 'mentions'

export const SEARCH_BUCKETS: readonly SearchBucket[] = [
  'review-requested',
  'author',
  'involves',
  'mentions',
]

export interface ThreadComment {
  authorLogin: string
  createdAt: string
}

export interface ReviewThread {
  id: string
  isResolved: boolean
  comments: ThreadComment[]
}

export type ReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING'

export interface Review {
  authorLogin: string
  state: ReviewState
  submittedAt: string
}

export type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUIRED'
  | null

export interface PullRequest {
  id: string
  number: number
  title: string
  url: string
  repository: string
  authorLogin: string
  authorAvatarUrl: string
  createdAt: string
  updatedAt: string
  isDraft: boolean
  additions: number
  deletions: number
  ciStatus: CiStatus
  lastCommitPushedAt: string
  reviewDecision: ReviewDecision
  reviews: Review[]
  reviewThreads: ReviewThread[]
  buckets: SearchBucket[]
}

export type Category =
  | 'needs-review'
  | 'new-replies'
  | 're-review'
  | 'my-pr-action'
  | 'mentioned'
  | 'waiting'
  | 'hidden'

/** Categories that count toward the menu-bar badge, in display order. */
export const ATTENTION_CATEGORIES: readonly Category[] = [
  'needs-review',
  'new-replies',
  're-review',
  'my-pr-action',
  'mentioned',
]

/** All visible categories, in display order. `waiting` renders last, collapsed. */
export const VISIBLE_CATEGORIES: readonly Category[] = [
  ...ATTENTION_CATEGORIES,
  'waiting',
]

export const CATEGORY_TITLES: Record<Category, string> = {
  'needs-review': 'Нужно ревью',
  'new-replies': 'Новые ответы тебе',
  're-review': 'Re-review',
  'my-pr-action': 'Твои PRы',
  mentioned: 'Упоминания',
  waiting: 'Ждёшь ответа',
  hidden: '',
}

export interface ClassifiedPullRequest {
  pr: PullRequest
  category: Category
  reason: string
  isSnoozed: boolean
}

export type SnoozeType = 'until-reply' | 'until-new-commits' | 'until-time'

export interface Snooze {
  prId: string
  type: SnoozeType
  /** ISO timestamp of when the snooze was created. */
  snoozedAt: string
  /** ISO timestamp; only set when `type === 'until-time'`. */
  until?: string
}

export interface Settings {
  pollIntervalMinutes: number
  repositories: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  pollIntervalMinutes: 5,
  repositories: [],
}
```

- [ ] **Step 2: Write the test factory**

Create `src/core/test-factory.ts` (imported by several test files; not test code itself, so it is excluded from the `*.test.ts` glob):

```ts
import type { PullRequest, ReviewThread, ThreadComment } from '@shared/types'

export function makeComment(
  authorLogin: string,
  createdAt: string,
): ThreadComment {
  return { authorLogin, createdAt }
}

export function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: 'thread-1',
    isResolved: false,
    comments: [],
    ...overrides,
  }
}

export function makePullRequest(
  overrides: Partial<PullRequest> = {},
): PullRequest {
  return {
    id: 'PR_1',
    number: 1,
    title: 'Add feature',
    url: 'https://github.com/acme/web/pull/1',
    repository: 'acme/web',
    authorLogin: 'alice',
    authorAvatarUrl: 'https://avatars.example/alice.png',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    isDraft: false,
    additions: 10,
    deletions: 2,
    ciStatus: 'success',
    lastCommitPushedAt: '2026-08-01T10:00:00Z',
    reviewDecision: 'REVIEW_REQUIRED',
    reviews: [],
    reviewThreads: [],
    buckets: [],
    ...overrides,
  }
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/core/threads.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  hasNewReplyInMyThreadsSince,
  hasParticipated,
  lastComment,
  myLatestReview,
  threadsAwaitingMyReply,
  unansweredThreads,
  unresolvedThreads,
} from '@core/threads'
import { makeComment, makePullRequest, makeThread } from './test-factory'

const ME = 'vlad'

describe('lastComment', () => {
  it('returns null for an empty thread', () => {
    expect(lastComment(makeThread())).toBeNull()
  })

  it('returns the final comment', () => {
    const thread = makeThread({
      comments: [
        makeComment(ME, '2026-08-01T10:00:00Z'),
        makeComment('alice', '2026-08-02T10:00:00Z'),
      ],
    })
    expect(lastComment(thread)?.authorLogin).toBe('alice')
  })
})

describe('unresolvedThreads', () => {
  it('drops resolved threads', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({ id: 'a', isResolved: true }),
        makeThread({ id: 'b', isResolved: false }),
      ],
    })
    expect(unresolvedThreads(pr).map((t) => t.id)).toEqual(['b'])
  })
})

describe('threadsAwaitingMyReply', () => {
  it('finds threads I am in where somebody else spoke last', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME).map((t) => t.id)).toEqual(['a'])
  })

  it('ignores threads where I spoke last', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [
            makeComment('alice', '2026-08-01T10:00:00Z'),
            makeComment(ME, '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME)).toEqual([])
  })

  it('ignores threads I never commented in', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [makeComment('alice', '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME)).toEqual([])
  })

  it('ignores resolved threads even when somebody replied to me', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          isResolved: true,
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME)).toEqual([])
  })
})

describe('unansweredThreads', () => {
  it('includes unresolved threads I never commented in', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [makeComment('alice', '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(unansweredThreads(pr, ME).map((t) => t.id)).toEqual(['a'])
  })

  it('excludes threads where I spoke last', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [
            makeComment('alice', '2026-08-01T10:00:00Z'),
            makeComment(ME, '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(unansweredThreads(pr, ME)).toEqual([])
  })

  it('excludes resolved threads', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          isResolved: true,
          comments: [makeComment('alice', '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(unansweredThreads(pr, ME)).toEqual([])
  })
})

describe('myLatestReview', () => {
  it('returns null when I never reviewed', () => {
    expect(myLatestReview(makePullRequest(), ME)).toBeNull()
  })

  it('returns my most recent submitted review', () => {
    const pr = makePullRequest({
      reviews: [
        { authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' },
        { authorLogin: 'alice', state: 'APPROVED', submittedAt: '2026-08-05T10:00:00Z' },
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-03T10:00:00Z' },
      ],
    })
    expect(myLatestReview(pr, ME)?.state).toBe('CHANGES_REQUESTED')
  })

  it('ignores my unsubmitted PENDING draft review', () => {
    const pr = makePullRequest({
      reviews: [
        { authorLogin: ME, state: 'PENDING', submittedAt: '2026-08-09T10:00:00Z' },
      ],
    })
    expect(myLatestReview(pr, ME)).toBeNull()
  })
})

describe('hasParticipated', () => {
  it('is false on an untouched PR', () => {
    expect(hasParticipated(makePullRequest(), ME)).toBe(false)
  })

  it('is true when I submitted a review', () => {
    const pr = makePullRequest({
      reviews: [
        { authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' },
      ],
    })
    expect(hasParticipated(pr, ME)).toBe(true)
  })

  it('is true when I commented in a thread, even a resolved one', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [makeComment(ME, '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(hasParticipated(pr, ME)).toBe(true)
  })
})

describe('hasNewReplyInMyThreadsSince', () => {
  const since = '2026-08-02T00:00:00Z'

  it('is true when somebody replied to my thread after the cutoff', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-03T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(hasNewReplyInMyThreadsSince(pr, ME, since)).toBe(true)
  })

  it('is false when the only new comment is my own', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment(ME, '2026-08-03T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(hasNewReplyInMyThreadsSince(pr, ME, since)).toBe(false)
  })

  it('is false when the reply predates the cutoff', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T09:00:00Z'),
            makeComment('alice', '2026-08-01T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(hasNewReplyInMyThreadsSince(pr, ME, since)).toBe(false)
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/core/threads.test.ts`
Expected: FAIL — `Failed to resolve import "@core/threads"`.

- [ ] **Step 5: Write `src/core/threads.ts`**

```ts
import type {
  PullRequest,
  Review,
  ReviewThread,
  ThreadComment,
} from '@shared/types'

export function lastComment(thread: ReviewThread): ThreadComment | null {
  return thread.comments.at(-1) ?? null
}

/**
 * Resolved threads are dropped here and nowhere else. Every rule in the app
 * reads threads through this function so the "resolved is invisible" guarantee
 * holds in one place.
 */
export function unresolvedThreads(pr: PullRequest): ReviewThread[] {
  return pr.reviewThreads.filter((thread) => !thread.isResolved)
}

/** Unresolved threads I commented in, where somebody else spoke last. */
export function threadsAwaitingMyReply(
  pr: PullRequest,
  myLogin: string,
): ReviewThread[] {
  return unresolvedThreads(pr).filter((thread) => {
    const iCommented = thread.comments.some((c) => c.authorLogin === myLogin)
    const last = lastComment(thread)
    return iCommented && last !== null && last.authorLogin !== myLogin
  })
}

/**
 * Unresolved threads where somebody else spoke last, whether or not I am in
 * them. Used for my own PRs, where a reviewer's brand-new thread still needs
 * my answer.
 */
export function unansweredThreads(
  pr: PullRequest,
  myLogin: string,
): ReviewThread[] {
  return unresolvedThreads(pr).filter((thread) => {
    const last = lastComment(thread)
    return last !== null && last.authorLogin !== myLogin
  })
}

export function myLatestReview(
  pr: PullRequest,
  myLogin: string,
): Review | null {
  const mine = pr.reviews
    .filter((r) => r.authorLogin === myLogin && r.state !== 'PENDING')
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  return mine.at(-1) ?? null
}

export function hasParticipated(pr: PullRequest, myLogin: string): boolean {
  if (myLatestReview(pr, myLogin) !== null) return true
  return pr.reviewThreads.some((thread) =>
    thread.comments.some((c) => c.authorLogin === myLogin),
  )
}

export function hasNewReplyInMyThreadsSince(
  pr: PullRequest,
  myLogin: string,
  since: string,
): boolean {
  return unresolvedThreads(pr).some((thread) => {
    const iCommented = thread.comments.some((c) => c.authorLogin === myLogin)
    if (!iCommented) return false
    return thread.comments.some(
      (c) => c.authorLogin !== myLogin && c.createdAt > since,
    )
  })
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/core/threads.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 7: Remove the smoke test and verify the suite**

```bash
rm src/core/smoke.test.ts
npm test && npm run typecheck
```

Expected: PASS, 16 tests; typecheck silent.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add domain types and review-thread predicates"
```

---

### Task 3: Snooze evaluation

**Files:**
- Create: `src/core/snooze.ts`
- Test: `src/core/snooze.test.ts`

**Interfaces:**
- Consumes: `hasNewReplyInMyThreadsSince` from `@core/threads`; `PullRequest`, `Snooze` from `@shared/types`.
- Produces: `isSnoozeActive(pr: PullRequest, snooze: Snooze, myLogin: string, now: string): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/snooze.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isSnoozeActive } from '@core/snooze'
import type { Snooze } from '@shared/types'
import { makeComment, makePullRequest, makeThread } from './test-factory'

const ME = 'vlad'
const NOW = '2026-08-10T12:00:00Z'

describe('isSnoozeActive — until-time', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-time',
    snoozedAt: '2026-08-10T10:00:00Z',
    until: '2026-08-10T14:00:00Z',
  }

  it('is active before the deadline', () => {
    expect(isSnoozeActive(makePullRequest(), snooze, ME, NOW)).toBe(true)
  })

  it('expires at the deadline', () => {
    const later = '2026-08-10T14:00:00Z'
    expect(isSnoozeActive(makePullRequest(), snooze, ME, later)).toBe(false)
  })

  it('is inactive when `until` is missing', () => {
    const broken: Snooze = { ...snooze, until: undefined }
    expect(isSnoozeActive(makePullRequest(), broken, ME, NOW)).toBe(false)
  })
})

describe('isSnoozeActive — until-new-commits', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-new-commits',
    snoozedAt: '2026-08-10T10:00:00Z',
  }

  it('is active while the newest commit predates the snooze', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-09T10:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })

  it('wakes up once a newer commit lands', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-10T11:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(false)
  })
})

describe('isSnoozeActive — until-reply', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-reply',
    snoozedAt: '2026-08-10T10:00:00Z',
  }

  it('is active while nobody has answered my threads', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({ comments: [makeComment(ME, '2026-08-09T10:00:00Z')] }),
      ],
    })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })

  it('wakes up when somebody replies to my thread', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-09T10:00:00Z'),
            makeComment('alice', '2026-08-10T11:00:00Z'),
          ],
        }),
      ],
    })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(false)
  })

  it('stays asleep when the reply arrived in a resolved thread', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [
            makeComment(ME, '2026-08-09T10:00:00Z'),
            makeComment('alice', '2026-08-10T11:00:00Z'),
          ],
        }),
      ],
    })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/snooze.test.ts`
Expected: FAIL — `Failed to resolve import "@core/snooze"`.

- [ ] **Step 3: Write `src/core/snooze.ts`**

```ts
import { hasNewReplyInMyThreadsSince } from '@core/threads'
import type { PullRequest, Snooze } from '@shared/types'

/**
 * A snooze parks a PR in the "waiting" section. It stays active until its own
 * wake condition fires.
 */
export function isSnoozeActive(
  pr: PullRequest,
  snooze: Snooze,
  myLogin: string,
  now: string,
): boolean {
  switch (snooze.type) {
    case 'until-time':
      return snooze.until !== undefined && now < snooze.until
    case 'until-new-commits':
      return pr.lastCommitPushedAt <= snooze.snoozedAt
    case 'until-reply':
      return !hasNewReplyInMyThreadsSince(pr, myLogin, snooze.snoozedAt)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/snooze.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add snooze evaluation"
```

---

### Task 4: The classifier

This is the heart of the app. Everything else is plumbing around it.

**Files:**
- Create: `src/core/classify.ts`
- Test: `src/core/classify.test.ts`

**Interfaces:**
- Consumes: `compareIso` and all predicates from `@core/threads`; `isSnoozeActive` from `@core/snooze`.
- Produces:
  - `interface ClassifyContext { myLogin: string; snoozes: Record<string, Snooze>; now: string }`
  - `classify(pr: PullRequest, ctx: ClassifyContext): ClassifiedPullRequest`
  - `classifyAll(prs: PullRequest[], ctx: ClassifyContext): ClassifiedPullRequest[]` — drops `hidden`, sorts by category order then by `updatedAt` descending.
  - `countAttention(items: ClassifiedPullRequest[]): number`

**Rules, in priority order** (first match wins):

*Not my PR:*
1. `needs-review` — in the `review-requested` bucket and I have not participated.
2. `new-replies` — at least one unresolved thread I am in where somebody else spoke last.
3. `re-review` — I submitted a review, and either review was re-requested or a commit landed after my review.
4. `mentioned` — in the `mentions` bucket, not requested, not participated.
5. `waiting` — I participated but none of the above.
6. `hidden` — otherwise.

*My PR:*
1. `my-pr-action` / changes requested.
2. `my-pr-action` / unresolved threads somebody else spoke last in.
3. `my-pr-action` / CI failed.
4. `my-pr-action` / approved, mergeable.
5. `waiting` — otherwise.

*Overrides:* a draft PR is always `hidden`. An active snooze downgrades any non-hidden result to `waiting`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/classify.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classify, classifyAll, countAttention } from '@core/classify'
import type { ClassifyContext } from '@core/classify'
import type { Snooze } from '@shared/types'
import { makeComment, makePullRequest, makeThread } from './test-factory'

const ME = 'vlad'
const NOW = '2026-08-10T12:00:00Z'

function ctx(snoozes: Record<string, Snooze> = {}): ClassifyContext {
  return { myLogin: ME, snoozes, now: NOW }
}

describe('classify — visibility overrides', () => {
  it('hides drafts', () => {
    const pr = makePullRequest({ isDraft: true, buckets: ['review-requested'] })
    expect(classify(pr, ctx()).category).toBe('hidden')
  })

  it('hides a PR I am neither requested on nor involved in', () => {
    const pr = makePullRequest({ buckets: ['involves'] })
    expect(classify(pr, ctx()).category).toBe('hidden')
  })
})

describe('classify — reviewer branch', () => {
  it('needs-review when requested and untouched', () => {
    const pr = makePullRequest({ buckets: ['review-requested'] })
    const result = classify(pr, ctx())
    expect(result.category).toBe('needs-review')
    expect(result.reason).toBe('Ты назначен ревьюером')
  })

  it('new-replies when somebody answered my thread', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('new-replies')
    expect(result.reason).toBe('1 новый ответ в твоих тредах')
  })

  it('pluralises the reply count', () => {
    const thread = (id: string) =>
      makeThread({
        id,
        comments: [
          makeComment(ME, '2026-08-01T10:00:00Z'),
          makeComment('alice', '2026-08-02T10:00:00Z'),
        ],
      })
    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [thread('a'), thread('b'), thread('c')],
    })
    expect(classify(pr, ctx()).reason).toBe('3 новых ответа в твоих тредах')
  })

  it('ignores a resolved thread that somebody answered', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(classify(pr, ctx()).category).toBe('waiting')
  })

  it('re-review when a commit landed after my review', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviews: [
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-01T10:00:00Z' },
      ],
      lastCommitPushedAt: '2026-08-05T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('re-review')
    expect(result.reason).toBe('Новые коммиты после твоего ревью')
  })

  it('re-review when review was re-requested after I reviewed', () => {
    const pr = makePullRequest({
      buckets: ['review-requested', 'involves'],
      reviews: [
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-05T10:00:00Z' },
      ],
      lastCommitPushedAt: '2026-08-01T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('re-review')
    expect(result.reason).toBe('Ревью запрошено повторно')
  })

  it('new-replies outranks re-review', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviews: [
        { authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' },
      ],
      lastCommitPushedAt: '2026-08-05T10:00:00Z',
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(classify(pr, ctx()).category).toBe('new-replies')
  })

  it('mentioned when only @-mentioned', () => {
    const pr = makePullRequest({ buckets: ['mentions', 'involves'] })
    const result = classify(pr, ctx())
    expect(result.category).toBe('mentioned')
    expect(result.reason).toBe('Тебя упомянули')
  })

  it('needs-review outranks mentioned', () => {
    const pr = makePullRequest({ buckets: ['mentions', 'review-requested'] })
    expect(classify(pr, ctx()).category).toBe('needs-review')
  })

  it('waiting when I reviewed and the author has not moved', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviews: [
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-05T10:00:00Z' },
      ],
      lastCommitPushedAt: '2026-08-01T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
    expect(result.reason).toBe('Ждёшь ответа автора')
  })
})

describe('classify — author branch', () => {
  const mine = { authorLogin: ME, buckets: ['author' as const] }

  it('my-pr-action on changes requested', () => {
    const pr = makePullRequest({ ...mine, reviewDecision: 'CHANGES_REQUESTED' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('Запрошены изменения')
  })

  it('my-pr-action on a reviewer thread I have not answered', () => {
    const pr = makePullRequest({
      ...mine,
      reviewThreads: [
        makeThread({ comments: [makeComment('alice', '2026-08-02T10:00:00Z')] }),
      ],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('1 тред ждёт ответа')
  })

  it('pluralises the unanswered thread count', () => {
    const thread = (id: string) =>
      makeThread({ id, comments: [makeComment('alice', '2026-08-02T10:00:00Z')] })
    const pr = makePullRequest({
      ...mine,
      reviewThreads: [thread('a'), thread('b')],
    })
    expect(classify(pr, ctx()).reason).toBe('2 треда ждут ответа')
  })

  it('ignores resolved threads on my own PR', () => {
    const pr = makePullRequest({
      ...mine,
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [makeComment('alice', '2026-08-02T10:00:00Z')],
        }),
      ],
    })
    expect(classify(pr, ctx()).category).toBe('waiting')
  })

  it('my-pr-action on CI failure', () => {
    const pr = makePullRequest({ ...mine, ciStatus: 'failure' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('CI упал')
  })

  it('my-pr-action when approved and mergeable', () => {
    const pr = makePullRequest({ ...mine, reviewDecision: 'APPROVED' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('Апрувнут — можно мержить')
  })

  it('CI failure outranks the approval', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'APPROVED',
      ciStatus: 'failure',
    })
    expect(classify(pr, ctx()).reason).toBe('CI упал')
  })

  it('waiting while reviewers have not responded', () => {
    const pr = makePullRequest({ ...mine, reviewDecision: 'REVIEW_REQUIRED' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
    expect(result.reason).toBe('Ждёшь ревью')
  })
})

describe('classify — snooze override', () => {
  it('demotes an attention PR to waiting while snoozed', () => {
    const pr = makePullRequest({ buckets: ['review-requested'] })
    const snoozes = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-time' as const,
        snoozedAt: '2026-08-10T10:00:00Z',
        until: '2026-08-10T14:00:00Z',
      },
    }
    const result = classify(pr, ctx(snoozes))
    expect(result.category).toBe('waiting')
    expect(result.isSnoozed).toBe(true)
    expect(result.reason).toBe('Отложен')
  })

  it('restores the PR once the snooze expires', () => {
    const pr = makePullRequest({ buckets: ['review-requested'] })
    const snoozes = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-time' as const,
        snoozedAt: '2026-08-10T08:00:00Z',
        until: '2026-08-10T09:00:00Z',
      },
    }
    const result = classify(pr, ctx(snoozes))
    expect(result.category).toBe('needs-review')
    expect(result.isSnoozed).toBe(false)
  })

  it('keeps a hidden PR hidden rather than surfacing it as waiting', () => {
    const pr = makePullRequest({ isDraft: true, buckets: ['review-requested'] })
    const snoozes = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-time' as const,
        snoozedAt: '2026-08-10T10:00:00Z',
        until: '2026-08-10T14:00:00Z',
      },
    }
    expect(classify(pr, ctx(snoozes)).category).toBe('hidden')
  })
})

describe('classifyAll', () => {
  it('drops hidden PRs and orders by category then recency', () => {
    const prs = [
      makePullRequest({
        id: 'PR_waiting',
        authorLogin: ME,
        buckets: ['author'],
        updatedAt: '2026-08-09T10:00:00Z',
      }),
      makePullRequest({ id: 'PR_hidden', buckets: ['involves'] }),
      makePullRequest({
        id: 'PR_old_review',
        buckets: ['review-requested'],
        updatedAt: '2026-08-01T10:00:00Z',
      }),
      makePullRequest({
        id: 'PR_new_review',
        buckets: ['review-requested'],
        updatedAt: '2026-08-08T10:00:00Z',
      }),
    ]
    const ids = classifyAll(prs, ctx()).map((item) => item.pr.id)
    expect(ids).toEqual(['PR_new_review', 'PR_old_review', 'PR_waiting'])
  })
})

describe('countAttention', () => {
  it('counts everything except waiting', () => {
    const items = classifyAll(
      [
        makePullRequest({ id: 'a', buckets: ['review-requested'] }),
        makePullRequest({ id: 'b', authorLogin: ME, buckets: ['author'] }),
      ],
      ctx(),
    )
    expect(countAttention(items)).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/classify.test.ts`
Expected: FAIL — `Failed to resolve import "@core/classify"`.

- [ ] **Step 3: Write `src/core/classify.ts`**

```ts
import { isSnoozeActive } from '@core/snooze'
import {
  compareIso,
  hasParticipated,
  myLatestReview,
  threadsAwaitingMyReply,
  unansweredThreads,
} from '@core/threads'
import {
  ATTENTION_CATEGORIES,
  VISIBLE_CATEGORIES,
  type Category,
  type ClassifiedPullRequest,
  type PullRequest,
  type Snooze,
} from '@shared/types'

export interface ClassifyContext {
  myLogin: string
  snoozes: Record<string, Snooze>
  /** ISO timestamp treated as "now". Injected so the classifier stays pure. */
  now: string
}

interface Verdict {
  category: Category
  reason: string
}

/** Russian count agreement: 1 ответ, 2 ответа, 5 ответов. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function classifyReviewPr(pr: PullRequest, myLogin: string): Verdict {
  const requested = pr.buckets.includes('review-requested')
  const participated = hasParticipated(pr, myLogin)

  if (requested && !participated) {
    return { category: 'needs-review', reason: 'Ты назначен ревьюером' }
  }

  const awaiting = threadsAwaitingMyReply(pr, myLogin)
  if (awaiting.length > 0) {
    const word = plural(awaiting.length, 'новый ответ', 'новых ответа', 'новых ответов')
    return {
      category: 'new-replies',
      reason: `${awaiting.length} ${word} в твоих тредах`,
    }
  }

  const myReview = myLatestReview(pr, myLogin)
  if (myReview !== null) {
    // I already reviewed, so GitHub cleared me from the reviewer list.
    // Being requested again means the author asked for another pass.
    if (requested) {
      return { category: 're-review', reason: 'Ревью запрошено повторно' }
    }
    if (pr.lastCommitPushedAt > myReview.submittedAt) {
      return { category: 're-review', reason: 'Новые коммиты после твоего ревью' }
    }
  }

  if (pr.buckets.includes('mentions') && !requested && !participated) {
    return { category: 'mentioned', reason: 'Тебя упомянули' }
  }

  if (participated) {
    return { category: 'waiting', reason: 'Ждёшь ответа автора' }
  }

  return { category: 'hidden', reason: '' }
}

function classifyOwnPr(pr: PullRequest, myLogin: string): Verdict {
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    return { category: 'my-pr-action', reason: 'Запрошены изменения' }
  }

  const unanswered = unansweredThreads(pr, myLogin)
  if (unanswered.length > 0) {
    const word = plural(unanswered.length, 'тред ждёт', 'треда ждут', 'тредов ждут')
    return { category: 'my-pr-action', reason: `${unanswered.length} ${word} ответа` }
  }

  if (pr.ciStatus === 'failure') {
    return { category: 'my-pr-action', reason: 'CI упал' }
  }

  if (pr.reviewDecision === 'APPROVED') {
    return { category: 'my-pr-action', reason: 'Апрувнут — можно мержить' }
  }

  return { category: 'waiting', reason: 'Ждёшь ревью' }
}

export function classify(
  pr: PullRequest,
  ctx: ClassifyContext,
): ClassifiedPullRequest {
  if (pr.isDraft) {
    return { pr, category: 'hidden', reason: '', isSnoozed: false }
  }

  const verdict =
    pr.authorLogin === ctx.myLogin
      ? classifyOwnPr(pr, ctx.myLogin)
      : classifyReviewPr(pr, ctx.myLogin)

  if (verdict.category === 'hidden') {
    return { pr, ...verdict, isSnoozed: false }
  }

  const snooze = ctx.snoozes[pr.id]
  if (snooze !== undefined && isSnoozeActive(pr, snooze, ctx.myLogin, ctx.now)) {
    return { pr, category: 'waiting', reason: 'Отложен', isSnoozed: true }
  }

  return { pr, ...verdict, isSnoozed: false }
}

export function classifyAll(
  prs: PullRequest[],
  ctx: ClassifyContext,
): ClassifiedPullRequest[] {
  return prs
    .map((pr) => classify(pr, ctx))
    .filter((item) => item.category !== 'hidden')
    .sort((a, b) => {
      const byCategory =
        VISIBLE_CATEGORIES.indexOf(a.category) -
        VISIBLE_CATEGORIES.indexOf(b.category)
      if (byCategory !== 0) return byCategory
      // Newest first. compareIso is the project's one ISO comparator.
      return compareIso(b.pr.updatedAt, a.pr.updatedAt)
    })
}

export function countAttention(items: ClassifiedPullRequest[]): number {
  return items.filter((item) => ATTENTION_CATEGORIES.includes(item.category))
    .length
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/classify.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add the whose-ball-is-it classifier"
```

---

### Task 5: Search query building

**Files:**
- Create: `src/core/search-query.ts`
- Test: `src/core/search-query.test.ts`

**Interfaces:**
- Consumes: `SearchBucket` from `@shared/types`.
- Produces:
  - `chunk<T>(items: T[], size: number): T[][]`
  - `buildSearchQueries(repositories: string[], bucket: SearchBucket, chunkSize?: number): string[]`

Note: the queries deliberately do **not** filter drafts. Visibility rules live in the classifier so there is one source of truth for what is hidden.

- [ ] **Step 1: Write the failing tests**

Create `src/core/search-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSearchQueries, chunk } from '@core/search-query'

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns an empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([])
  })
})

describe('buildSearchQueries', () => {
  it('returns nothing when no repositories are configured', () => {
    expect(buildSearchQueries([], 'author')).toEqual([])
  })

  it('builds one query for a small repository list', () => {
    expect(buildSearchQueries(['acme/web', 'acme/api'], 'review-requested')).toEqual([
      'repo:acme/web repo:acme/api is:pr is:open review-requested:@me',
    ])
  })

  it('maps every bucket to its qualifier', () => {
    expect(buildSearchQueries(['acme/web'], 'author')[0]).toContain('author:@me')
    expect(buildSearchQueries(['acme/web'], 'involves')[0]).toContain('involves:@me')
    expect(buildSearchQueries(['acme/web'], 'mentions')[0]).toContain('mentions:@me')
  })

  it('splits long repository lists across several queries', () => {
    const repos = Array.from({ length: 12 }, (_, i) => `acme/repo${i}`)
    const queries = buildSearchQueries(repos, 'author', 10)
    expect(queries).toHaveLength(2)
    expect(queries[0]).toContain('repo:acme/repo9')
    expect(queries[1]).toContain('repo:acme/repo10')
    expect(queries[1]).toContain('author:@me')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/search-query.test.ts`
Expected: FAIL — `Failed to resolve import "@core/search-query"`.

- [ ] **Step 3: Write `src/core/search-query.ts`**

```ts
import type { SearchBucket } from '@shared/types'

const BUCKET_QUALIFIERS: Record<SearchBucket, string> = {
  'review-requested': 'review-requested:@me',
  author: 'author:@me',
  involves: 'involves:@me',
  mentions: 'mentions:@me',
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size))
  }
  return groups
}

/**
 * GitHub search caps how many qualifiers one query may carry, so a long
 * repository list is split across several queries.
 *
 * `review-requested:@me` already covers requests that reached the user through
 * a team, so team membership never has to be resolved separately.
 */
export function buildSearchQueries(
  repositories: string[],
  bucket: SearchBucket,
  chunkSize = 10,
): string[] {
  if (repositories.length === 0) return []
  return chunk(repositories, chunkSize).map((group) =>
    [
      ...group.map((repo) => `repo:${repo}`),
      'is:pr',
      'is:open',
      BUCKET_QUALIFIERS[bucket],
    ].join(' '),
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/search-query.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add GitHub search query building"
```

---

### Task 6: GraphQL response mapping

**Files:**
- Create: `src/core/map-pr.ts`
- Test: `src/core/map-pr.test.ts`

**Interfaces:**
- Consumes: `CiStatus`, `PullRequest`, `SearchBucket` from `@shared/types`.
- Produces:
  - `interface PullRequestNode` — the shape of one PR node as returned by the detail query (exported so `fetch-prs.ts` can type its response).
  - `mapCiStatus(state: string | null | undefined): CiStatus`
  - `mapPullRequest(node: PullRequestNode, buckets: SearchBucket[]): PullRequest`

Deleted GitHub accounts come back as `author: null`, so every author field falls back to `'ghost'`. The commit `pushedDate` field is gone from GitHub's schema, so `committedDate` stands in for when the branch last moved.

- [ ] **Step 1: Write the failing tests**

Create `src/core/map-pr.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapCiStatus, mapPullRequest } from '@core/map-pr'
import type { PullRequestNode } from '@core/map-pr'

function node(overrides: Partial<PullRequestNode> = {}): PullRequestNode {
  return {
    id: 'PR_1',
    number: 7,
    title: 'Add feature',
    url: 'https://github.com/acme/web/pull/7',
    isDraft: false,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-02T10:00:00Z',
    additions: 12,
    deletions: 3,
    reviewDecision: 'REVIEW_REQUIRED',
    author: { login: 'alice', avatarUrl: 'https://avatars.example/alice.png' },
    repository: { nameWithOwner: 'acme/web' },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    commits: { nodes: [] },
    ...overrides,
  }
}

describe('mapCiStatus', () => {
  it('maps GitHub rollup states', () => {
    expect(mapCiStatus('SUCCESS')).toBe('success')
    expect(mapCiStatus('FAILURE')).toBe('failure')
    expect(mapCiStatus('ERROR')).toBe('failure')
    expect(mapCiStatus('PENDING')).toBe('pending')
    expect(mapCiStatus('EXPECTED')).toBe('pending')
  })

  it('treats a missing rollup as no CI', () => {
    expect(mapCiStatus(null)).toBe('none')
    expect(mapCiStatus(undefined)).toBe('none')
  })
})

describe('mapPullRequest', () => {
  it('copies the scalar fields and attaches the buckets', () => {
    const pr = mapPullRequest(node(), ['review-requested'])
    expect(pr.id).toBe('PR_1')
    expect(pr.number).toBe(7)
    expect(pr.repository).toBe('acme/web')
    expect(pr.authorLogin).toBe('alice')
    expect(pr.buckets).toEqual(['review-requested'])
  })

  it('falls back to ghost for a deleted author', () => {
    const pr = mapPullRequest(node({ author: null }), [])
    expect(pr.authorLogin).toBe('ghost')
    expect(pr.authorAvatarUrl).toBe('')
  })

  it('flattens reviews and drops ones with no author', () => {
    const pr = mapPullRequest(
      node({
        reviews: {
          nodes: [
            { author: { login: 'bob' }, state: 'APPROVED', submittedAt: '2026-08-02T10:00:00Z' },
            { author: null, state: 'COMMENTED', submittedAt: '2026-08-03T10:00:00Z' },
          ],
        },
      }),
      [],
    )
    expect(pr.reviews).toEqual([
      { authorLogin: 'bob', state: 'APPROVED', submittedAt: '2026-08-02T10:00:00Z' },
    ])
  })

  it('flattens review threads with their comments', () => {
    const pr = mapPullRequest(
      node({
        reviewThreads: {
          nodes: [
            {
              id: 'RT_1',
              isResolved: true,
              comments: {
                nodes: [
                  { author: { login: 'vlad' }, createdAt: '2026-08-02T10:00:00Z' },
                ],
              },
            },
          ],
        },
      }),
      [],
    )
    expect(pr.reviewThreads).toEqual([
      {
        id: 'RT_1',
        isResolved: true,
        comments: [{ authorLogin: 'vlad', createdAt: '2026-08-02T10:00:00Z' }],
      },
    ])
  })

  it('reads the last commit date and CI status', () => {
    const pr = mapPullRequest(
      node({
        commits: {
          nodes: [
            {
              commit: {
                committedDate: '2026-08-04T10:00:00Z',
                statusCheckRollup: { state: 'FAILURE' },
              },
            },
          ],
        },
      }),
      [],
    )
    expect(pr.lastCommitPushedAt).toBe('2026-08-04T10:00:00Z')
    expect(pr.ciStatus).toBe('failure')
  })

  it('falls back to createdAt when the commit list is empty', () => {
    const pr = mapPullRequest(node(), [])
    expect(pr.lastCommitPushedAt).toBe('2026-08-01T10:00:00Z')
    expect(pr.ciStatus).toBe('none')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/map-pr.test.ts`
Expected: FAIL — `Failed to resolve import "@core/map-pr"`.

- [ ] **Step 3: Write `src/core/map-pr.ts`**

```ts
import type {
  CiStatus,
  PullRequest,
  ReviewDecision,
  ReviewState,
  SearchBucket,
} from '@shared/types'

interface ActorNode {
  login: string
  avatarUrl?: string
}

export interface PullRequestNode {
  id: string
  number: number
  title: string
  url: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  reviewDecision: ReviewDecision
  author: ActorNode | null
  repository: { nameWithOwner: string }
  reviews: {
    nodes: Array<{
      author: ActorNode | null
      state: ReviewState
      submittedAt: string
    } | null>
  }
  reviewThreads: {
    nodes: Array<{
      id: string
      isResolved: boolean
      comments: {
        nodes: Array<{ author: ActorNode | null; createdAt: string } | null>
      }
    } | null>
  }
  commits: {
    nodes: Array<{
      commit: {
        committedDate: string
        statusCheckRollup: { state: string } | null
      }
    } | null>
  }
}

export function mapCiStatus(state: string | null | undefined): CiStatus {
  switch (state) {
    case 'SUCCESS':
      return 'success'
    case 'FAILURE':
    case 'ERROR':
      return 'failure'
    case 'PENDING':
    case 'EXPECTED':
      return 'pending'
    default:
      return 'none'
  }
}

export function mapPullRequest(
  node: PullRequestNode,
  buckets: SearchBucket[],
): PullRequest {
  const lastCommit = node.commits.nodes[0]?.commit ?? null

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    repository: node.repository.nameWithOwner,
    authorLogin: node.author?.login ?? 'ghost',
    authorAvatarUrl: node.author?.avatarUrl ?? '',
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    isDraft: node.isDraft,
    additions: node.additions,
    deletions: node.deletions,
    ciStatus: mapCiStatus(lastCommit?.statusCheckRollup?.state),
    lastCommitPushedAt: lastCommit?.committedDate ?? node.createdAt,
    reviewDecision: node.reviewDecision,
    reviews: node.reviews.nodes.flatMap((review) =>
      review?.author
        ? [
            {
              authorLogin: review.author.login,
              state: review.state,
              submittedAt: review.submittedAt,
            },
          ]
        : [],
    ),
    reviewThreads: node.reviewThreads.nodes.flatMap((thread) =>
      thread
        ? [
            {
              id: thread.id,
              isResolved: thread.isResolved,
              comments: thread.comments.nodes.flatMap((comment) =>
                comment?.author
                  ? [
                      {
                        authorLogin: comment.author.login,
                        createdAt: comment.createdAt,
                      },
                    ]
                  : [],
              ),
            },
          ]
        : [],
    ),
    buckets,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/map-pr.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: map GraphQL nodes to domain pull requests"
```

---

### Task 7: Persisted store

**Files:**
- Create: `src/main/store.ts`
- Test: `src/main/store.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`, `Settings`, `Snooze`, `SnoozeType` from `@shared/types`.
- Produces:
  - `interface PersistedState { settings: Settings; snoozes: Record<string, Snooze>; seen: Record<string, string> }`
  - `interface KeyValueStore { get<K extends keyof PersistedState>(key: K): PersistedState[K]; set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void }`
  - `class AppStore` with `getSettings()`, `updateSettings(patch)`, `addRepository(fullName)`, `removeRepository(fullName)`, `getSnoozes()`, `snooze(prId, type, now, hours?)`, `unsnooze(prId)`, `markSeen(prId, now)`, `getSeen()`
  - `createAppStore(): AppStore` — the production factory backed by `electron-store`.

`AppStore` takes a `KeyValueStore` so tests run without Electron. `electron-store` satisfies that interface directly.

- [ ] **Step 1: Write the failing tests**

Create `src/main/store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { AppStore } from './store'
import type { KeyValueStore, PersistedState } from './store'
import { DEFAULT_SETTINGS } from '@shared/types'

class MemoryStore implements KeyValueStore {
  private state: PersistedState = {
    settings: { ...DEFAULT_SETTINGS },
    snoozes: {},
    seen: {},
  }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
  }
}

const NOW = '2026-08-10T12:00:00Z'
let store: AppStore

beforeEach(() => {
  store = new AppStore(new MemoryStore())
})

describe('settings', () => {
  it('starts with a five minute poll interval', () => {
    expect(store.getSettings().pollIntervalMinutes).toBe(5)
  })

  it('applies a partial update', () => {
    store.updateSettings({ pollIntervalMinutes: 15 })
    expect(store.getSettings().pollIntervalMinutes).toBe(15)
    expect(store.getSettings().repositories).toEqual([])
  })
})

describe('repositories', () => {
  it('adds a repository', () => {
    store.addRepository('acme/web')
    expect(store.getSettings().repositories).toEqual(['acme/web'])
  })

  it('ignores a duplicate', () => {
    store.addRepository('acme/web')
    store.addRepository('acme/web')
    expect(store.getSettings().repositories).toEqual(['acme/web'])
  })

  it('normalises case and surrounding whitespace', () => {
    store.addRepository('  ACME/Web  ')
    expect(store.getSettings().repositories).toEqual(['acme/web'])
  })

  it('rejects a value that is not owner/repo', () => {
    expect(() => store.addRepository('acme')).toThrow(/owner\/repo/)
  })

  it('removes a repository', () => {
    store.addRepository('acme/web')
    store.addRepository('acme/api')
    store.removeRepository('acme/web')
    expect(store.getSettings().repositories).toEqual(['acme/api'])
  })
})

describe('snoozes', () => {
  it('records a timed snooze with a deadline', () => {
    store.snooze('PR_1', 'until-time', NOW, 3)
    const snooze = store.getSnoozes()['PR_1']
    expect(snooze?.type).toBe('until-time')
    expect(snooze?.snoozedAt).toBe(NOW)
    expect(snooze?.until).toBe('2026-08-10T15:00:00.000Z')
  })

  it('records a conditional snooze with no deadline', () => {
    store.snooze('PR_1', 'until-reply', NOW)
    const snooze = store.getSnoozes()['PR_1']
    expect(snooze?.type).toBe('until-reply')
    expect(snooze?.until).toBeUndefined()
  })

  it('requires hours for a timed snooze', () => {
    expect(() => store.snooze('PR_1', 'until-time', NOW)).toThrow(/hours/)
  })

  it('removes a snooze', () => {
    store.snooze('PR_1', 'until-reply', NOW)
    store.unsnooze('PR_1')
    expect(store.getSnoozes()['PR_1']).toBeUndefined()
  })
})

describe('seen marks', () => {
  it('records when a PR was marked seen', () => {
    store.markSeen('PR_1', NOW)
    expect(store.getSeen()['PR_1']).toBe(NOW)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write `src/main/store.ts`**

```ts
import Store from 'electron-store'
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Snooze,
  type SnoozeType,
} from '@shared/types'

export interface PersistedState {
  settings: Settings
  snoozes: Record<string, Snooze>
  /** PR id → ISO timestamp of when the user last marked it seen. */
  seen: Record<string, string>
}

export interface KeyValueStore {
  get<K extends keyof PersistedState>(key: K): PersistedState[K]
  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

export class AppStore {
  constructor(private readonly backend: KeyValueStore) {}

  getSettings(): Settings {
    return this.backend.get('settings')
  }

  updateSettings(patch: Partial<Settings>): void {
    this.backend.set('settings', { ...this.getSettings(), ...patch })
  }

  addRepository(fullName: string): void {
    const normalised = fullName.trim().toLowerCase()
    if (!REPO_PATTERN.test(normalised)) {
      throw new Error(`Репозиторий должен быть в формате owner/repo: "${fullName}"`)
    }
    const current = this.getSettings().repositories
    if (current.includes(normalised)) return
    this.updateSettings({ repositories: [...current, normalised] })
  }

  removeRepository(fullName: string): void {
    const normalised = fullName.trim().toLowerCase()
    this.updateSettings({
      repositories: this.getSettings().repositories.filter(
        (repo) => repo !== normalised,
      ),
    })
  }

  getSnoozes(): Record<string, Snooze> {
    return this.backend.get('snoozes')
  }

  snooze(prId: string, type: SnoozeType, now: string, hours?: number): void {
    if (type === 'until-time' && hours === undefined) {
      throw new Error('until-time snooze requires hours')
    }
    const until =
      type === 'until-time'
        ? new Date(Date.parse(now) + hours! * 3_600_000).toISOString()
        : undefined
    this.backend.set('snoozes', {
      ...this.getSnoozes(),
      [prId]: { prId, type, snoozedAt: now, until },
    })
  }

  unsnooze(prId: string): void {
    const next = { ...this.getSnoozes() }
    delete next[prId]
    this.backend.set('snoozes', next)
  }

  getSeen(): Record<string, string> {
    return this.backend.get('seen')
  }

  markSeen(prId: string, now: string): void {
    this.backend.set('seen', { ...this.getSeen(), [prId]: now })
  }
}

export function createAppStore(): AppStore {
  const backend = new Store<PersistedState>({
    name: 'github-review-inbox',
    defaults: { settings: { ...DEFAULT_SETTINGS }, snoozes: {}, seen: {} },
  })
  return new AppStore(backend as unknown as KeyValueStore)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/store.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add persisted settings, snoozes and seen marks"
```

---

### Task 8: OAuth Device Flow and token storage

**Files:**
- Create: `src/main/auth/device-flow.ts`
- Create: `src/main/auth/token-storage.ts`
- Test: `src/main/auth/device-flow.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface DeviceCodeInfo { userCode: string; verificationUri: string; deviceCode: string; interval: number; expiresIn: number }`
  - `requestDeviceCode(clientId: string, fetchFn?: typeof fetch): Promise<DeviceCodeInfo>`
  - `pollForToken(clientId: string, info: DeviceCodeInfo, deps: PollDeps): Promise<string>` where `interface PollDeps { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void> }`
  - `GITHUB_SCOPES = 'repo read:org'`
  - `saveToken(token: string): void`, `loadToken(): string | null`, `clearToken(): void` from `token-storage.ts`

Device Flow is documented at `https://docs.github.com/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow`. The token endpoint answers `200 OK` with `error: "authorization_pending"` while the user has not approved yet, and `error: "slow_down"` when polled too fast.

- [ ] **Step 1: Write the failing tests**

Create `src/main/auth/device-flow.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { pollForToken, requestDeviceCode } from './device-flow'
import type { DeviceCodeInfo } from './device-flow'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const INFO: DeviceCodeInfo = {
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  deviceCode: 'device-code-value',
  interval: 5,
  expiresIn: 900,
}

describe('requestDeviceCode', () => {
  it('posts the client id and returns the user code', async () => {
    // vi.fn<typeof fetch> gives mock.calls the real [url, init] tuple shape.
    // Without it Vitest infers a zero-arg signature and destructuring calls[0]
    // fails to compile.
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        device_code: 'device-code-value',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        interval: 5,
        expires_in: 900,
      }),
    )

    const info = await requestDeviceCode('client-123', fetchFn as unknown as typeof fetch)

    expect(info).toEqual(INFO)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://github.com/login/device/code')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      client_id: 'client-123',
      scope: 'repo read:org',
    })
  })

  it('throws when GitHub reports an error', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: 'unauthorized_client' }),
    )
    await expect(
      requestDeviceCode('bad', fetchFn as unknown as typeof fetch),
    ).rejects.toThrow(/unauthorized_client/)
  })
})

describe('pollForToken', () => {
  it('returns the token once the user approves', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'gho_secret' }))
    const sleep = vi.fn(async () => {})

    const token = await pollForToken('client-123', INFO, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep,
    })

    expect(token).toBe('gho_secret')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(5000)
  })

  it('backs off by five seconds on slow_down', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'gho_secret' }))
    const sleep = vi.fn(async () => {})

    await pollForToken('client-123', INFO, {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep,
    })

    expect(sleep).toHaveBeenNthCalledWith(1, 5000)
    expect(sleep).toHaveBeenNthCalledWith(2, 10000)
  })

  it('gives up when the user denies the request', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'access_denied' }))
    await expect(
      pollForToken('client-123', INFO, {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/access_denied/)
  })

  it('gives up when the device code expires', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'expired_token' }))
    await expect(
      pollForToken('client-123', INFO, {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/expired_token/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/auth/device-flow.test.ts`
Expected: FAIL — cannot find module `./device-flow`.

- [ ] **Step 3: Write `src/main/auth/device-flow.ts`**

```ts
export const GITHUB_SCOPES = 'repo read:org'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  deviceCode: string
  /** Seconds GitHub asks us to wait between polls. */
  interval: number
  expiresIn: number
}

export interface PollDeps {
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

interface DeviceCodeResponse {
  device_code?: string
  user_code?: string
  verification_uri?: string
  interval?: number
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

async function postJson<T>(
  url: string,
  body: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<T> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`GitHub вернул ${response.status} на ${url}`)
  }
  return (await response.json()) as T
}

function describeError(error: string, description?: string): string {
  return description ? `${error}: ${description}` : error
}

export async function requestDeviceCode(
  clientId: string,
  fetchFn: typeof fetch = fetch,
): Promise<DeviceCodeInfo> {
  const data = await postJson<DeviceCodeResponse>(
    DEVICE_CODE_URL,
    { client_id: clientId, scope: GITHUB_SCOPES },
    fetchFn,
  )

  if (data.error !== undefined) {
    throw new Error(describeError(data.error, data.error_description))
  }
  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error('GitHub вернул неполный ответ на запрос device code')
  }

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in ?? 900,
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Polls until the user approves the device in their browser. Resolves with the
 * access token, or rejects if the user denies it or the code expires.
 */
export async function pollForToken(
  clientId: string,
  info: DeviceCodeInfo,
  deps: PollDeps = {},
): Promise<string> {
  const fetchFn = deps.fetchFn ?? fetch
  const sleep = deps.sleep ?? defaultSleep
  let intervalMs = info.interval * 1000

  for (;;) {
    await sleep(intervalMs)

    const data = await postJson<TokenResponse>(
      ACCESS_TOKEN_URL,
      {
        client_id: clientId,
        device_code: info.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
      fetchFn,
    )

    if (data.access_token !== undefined) return data.access_token

    switch (data.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        intervalMs += 5000
        break
      default:
        throw new Error(
          describeError(data.error ?? 'unknown_error', data.error_description),
        )
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/auth/device-flow.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write `src/main/auth/token-storage.ts`**

This file touches Electron directly, so it is verified by running the app in Task 13 rather than by unit tests.

```ts
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

function tokenPath(): string {
  return join(app.getPath('userData'), 'token.bin')
}

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Keychain недоступен — не могу сохранить токен')
  }
  writeFileSync(tokenPath(), safeStorage.encryptString(token))
}

export function loadToken(): string | null {
  try {
    const encrypted = readFileSync(tokenPath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

export function clearToken(): void {
  rmSync(tokenPath(), { force: true })
}
```

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add OAuth device flow and keychain token storage"
```

---

### Task 9: Fetching pull requests

**Files:**
- Create: `src/main/github/queries.ts`
- Create: `src/main/github/fetch-prs.ts`
- Test: `src/main/github/fetch-prs.test.ts`

**Interfaces:**
- Consumes: `buildSearchQueries`, `chunk` from `@core/search-query`; `mapPullRequest`, `PullRequestNode` from `@core/map-pr`.
- Produces:
  - `type GraphQLClient = (query: string, variables: Record<string, unknown>) => Promise<unknown>`
  - `createGraphQLClient(token: string): GraphQLClient`
  - `fetchViewerLogin(client: GraphQLClient): Promise<string>`
  - `fetchPullRequests(client: GraphQLClient, repositories: string[]): Promise<PullRequest[]>`
  - `SEARCH_QUERY`, `DETAILS_QUERY`, `VIEWER_QUERY` from `queries.ts`

Search returns ids only; details are fetched once per unique PR in batches of 25 so a PR appearing in several buckets costs one detail fetch.

- [ ] **Step 1: Write `src/main/github/queries.ts`**

```ts
export const VIEWER_QUERY = `
  query Viewer {
    viewer { login }
  }
`

export const SEARCH_QUERY = `
  query SearchPullRequests($q: String!) {
    search(query: $q, type: ISSUE, first: 50) {
      nodes {
        ... on PullRequest { id }
      }
    }
  }
`

export const DETAILS_QUERY = `
  query PullRequestDetails($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on PullRequest {
        id
        number
        title
        url
        isDraft
        createdAt
        updatedAt
        additions
        deletions
        reviewDecision
        author { login avatarUrl }
        repository { nameWithOwner }
        reviews(first: 50) {
          nodes { author { login } state submittedAt }
        }
        reviewThreads(first: 50) {
          nodes {
            id
            isResolved
            comments(first: 50) {
              nodes { author { login } createdAt }
            }
          }
        }
        commits(last: 1) {
          nodes {
            commit {
              committedDate
              statusCheckRollup { state }
            }
          }
        }
      }
    }
  }
`
```

- [ ] **Step 2: Write the failing tests**

Create `src/main/github/fetch-prs.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { fetchPullRequests, fetchViewerLogin } from './fetch-prs'
import { DETAILS_QUERY, SEARCH_QUERY, VIEWER_QUERY } from './queries'

function detailNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    number: 7,
    title: 'Add feature',
    url: `https://github.com/acme/web/pull/7`,
    isDraft: false,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-02T10:00:00Z',
    additions: 1,
    deletions: 0,
    reviewDecision: 'REVIEW_REQUIRED',
    author: { login: 'alice', avatarUrl: 'https://avatars.example/alice.png' },
    repository: { nameWithOwner: 'acme/web' },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    commits: { nodes: [] },
    ...overrides,
  }
}

/** Answers search queries from `idsByQualifier` and details from `nodes`. */
function fakeClient(
  idsByQualifier: Record<string, string[]>,
  nodes: Array<ReturnType<typeof detailNode>>,
) {
  return vi.fn(async (query: string, variables: Record<string, unknown>) => {
    if (query === VIEWER_QUERY) return { viewer: { login: 'vlad' } }
    if (query === SEARCH_QUERY) {
      const q = variables.q as string
      const qualifier = Object.keys(idsByQualifier).find((key) => q.includes(key))
      const ids = qualifier ? idsByQualifier[qualifier]! : []
      return { search: { nodes: ids.map((id) => ({ id })) } }
    }
    if (query === DETAILS_QUERY) {
      const ids = variables.ids as string[]
      return { nodes: nodes.filter((node) => ids.includes(node.id)) }
    }
    throw new Error(`unexpected query: ${query}`)
  })
}

describe('fetchViewerLogin', () => {
  it('returns the authenticated login', async () => {
    const client = fakeClient({}, [])
    await expect(fetchViewerLogin(client)).resolves.toBe('vlad')
  })
})

describe('fetchPullRequests', () => {
  it('returns nothing when no repositories are configured', async () => {
    const client = fakeClient({}, [])
    await expect(fetchPullRequests(client, [])).resolves.toEqual([])
    expect(client).not.toHaveBeenCalled()
  })

  it('records which buckets a PR came from', async () => {
    const client = fakeClient(
      { 'review-requested:@me': ['PR_1'], 'mentions:@me': ['PR_1'] },
      [detailNode('PR_1')],
    )
    const prs = await fetchPullRequests(client, ['acme/web'])
    expect(prs).toHaveLength(1)
    expect(prs[0]!.buckets.sort()).toEqual(['mentions', 'review-requested'])
  })

  it('fetches details once for a PR found in several buckets', async () => {
    const client = fakeClient(
      {
        'review-requested:@me': ['PR_1'],
        'involves:@me': ['PR_1'],
        'mentions:@me': ['PR_1'],
      },
      [detailNode('PR_1')],
    )
    await fetchPullRequests(client, ['acme/web'])
    const detailCalls = client.mock.calls.filter(([q]) => q === DETAILS_QUERY)
    expect(detailCalls).toHaveLength(1)
  })

  it('maps the detail node into a domain pull request', async () => {
    const client = fakeClient({ 'author:@me': ['PR_1'] }, [detailNode('PR_1')])
    const prs = await fetchPullRequests(client, ['acme/web'])
    expect(prs[0]!.repository).toBe('acme/web')
    expect(prs[0]!.authorLogin).toBe('alice')
  })

  it('skips ids the details query could not resolve', async () => {
    const client = fakeClient({ 'author:@me': ['PR_1', 'PR_missing'] }, [
      detailNode('PR_1'),
    ])
    const prs = await fetchPullRequests(client, ['acme/web'])
    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/main/github/fetch-prs.test.ts`
Expected: FAIL — cannot find module `./fetch-prs`.

- [ ] **Step 4: Write `src/main/github/fetch-prs.ts`**

```ts
import { graphql } from '@octokit/graphql'
import { mapPullRequest, type PullRequestNode } from '@core/map-pr'
import { buildSearchQueries, chunk } from '@core/search-query'
import { SEARCH_BUCKETS, type PullRequest, type SearchBucket } from '@shared/types'
import { DETAILS_QUERY, SEARCH_QUERY, VIEWER_QUERY } from './queries'

export type GraphQLClient = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>

const DETAIL_BATCH_SIZE = 25

export function createGraphQLClient(token: string): GraphQLClient {
  const authed = graphql.defaults({
    headers: { authorization: `token ${token}` },
  })
  return (query, variables) => authed(query, variables)
}

export async function fetchViewerLogin(client: GraphQLClient): Promise<string> {
  const data = (await client(VIEWER_QUERY, {})) as { viewer: { login: string } }
  return data.viewer.login
}

/** PR id → the set of search buckets it turned up in. */
async function collectIds(
  client: GraphQLClient,
  repositories: string[],
): Promise<Map<string, Set<SearchBucket>>> {
  const byId = new Map<string, Set<SearchBucket>>()

  for (const bucket of SEARCH_BUCKETS) {
    for (const q of buildSearchQueries(repositories, bucket)) {
      const data = (await client(SEARCH_QUERY, { q })) as {
        search: { nodes: Array<{ id?: string } | null> }
      }
      for (const node of data.search.nodes) {
        if (!node?.id) continue
        const buckets = byId.get(node.id) ?? new Set<SearchBucket>()
        buckets.add(bucket)
        byId.set(node.id, buckets)
      }
    }
  }

  return byId
}

export async function fetchPullRequests(
  client: GraphQLClient,
  repositories: string[],
): Promise<PullRequest[]> {
  if (repositories.length === 0) return []

  const bucketsById = await collectIds(client, repositories)
  const prs: PullRequest[] = []

  for (const ids of chunk([...bucketsById.keys()], DETAIL_BATCH_SIZE)) {
    const data = (await client(DETAILS_QUERY, { ids })) as {
      nodes: Array<PullRequestNode | null>
    }
    for (const node of data.nodes) {
      if (!node) continue
      prs.push(mapPullRequest(node, [...(bucketsById.get(node.id) ?? [])]))
    }
  }

  return prs
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/main/github/fetch-prs.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: fetch pull requests from the GitHub GraphQL API"
```

---

### Task 10: Inbox state and polling

**Files:**
- Create: `src/shared/ipc.ts`
- Create: `src/main/inbox.ts`
- Test: `src/main/inbox.test.ts`

**Interfaces:**
- Consumes: `AppStore` from `../store`; `classifyAll`, `countAttention` from `@core/classify`; `fetchPullRequests`, `fetchViewerLogin`, `GraphQLClient` from `./github/fetch-prs`.
- Produces from `@shared/ipc`:
  - `interface InboxSnapshot { status: 'signed-out' | 'loading' | 'ready' | 'error'; items: ClassifiedPullRequest[]; attentionCount: number; lastUpdatedAt: string | null; errorMessage: string | null; myLogin: string | null; seen: Record<string, string> }`
  - `interface DeviceCodePayload { userCode: string; verificationUri: string }`
  - `IPC` channel-name constants and the `RendererApi` interface.
- Produces from `./inbox`:
  - `interface InboxDeps { store: AppStore; getClient: () => GraphQLClient | null; onChange: (snapshot: InboxSnapshot) => void; now?: () => string; fetchPrs?: typeof fetchPullRequests; fetchLogin?: typeof fetchViewerLogin }`
  - `class Inbox` with `getSnapshot()`, `refresh()`, `start()`, `stop()`, `reclassify()`

`reclassify()` re-runs the classifier over the PRs already in memory without touching the network — that is what a snooze or an unsnooze needs.

- [ ] **Step 1: Write `src/shared/ipc.ts`**

```ts
import type { ClassifiedPullRequest, Settings, SnoozeType } from './types'

export interface InboxSnapshot {
  status: 'signed-out' | 'loading' | 'ready' | 'error'
  items: ClassifiedPullRequest[]
  attentionCount: number
  lastUpdatedAt: string | null
  errorMessage: string | null
  myLogin: string | null
  /** PR id → ISO timestamp of when the user last marked it seen. */
  seen: Record<string, string>
}

export interface DeviceCodePayload {
  userCode: string
  verificationUri: string
}

export const IPC = {
  getSnapshot: 'inbox:get-snapshot',
  snapshotChanged: 'inbox:snapshot-changed',
  refresh: 'inbox:refresh',
  openPr: 'inbox:open-pr',
  snooze: 'inbox:snooze',
  unsnooze: 'inbox:unsnooze',
  markSeen: 'inbox:mark-seen',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  addRepository: 'settings:add-repository',
  removeRepository: 'settings:remove-repository',
  startAuth: 'auth:start',
  deviceCode: 'auth:device-code',
  signOut: 'auth:sign-out',
} as const

export interface RendererApi {
  getSnapshot: () => Promise<InboxSnapshot>
  onSnapshot: (listener: (snapshot: InboxSnapshot) => void) => () => void
  onDeviceCode: (listener: (payload: DeviceCodePayload) => void) => () => void
  refresh: () => Promise<void>
  openPr: (url: string) => Promise<void>
  snooze: (prId: string, type: SnoozeType, hours?: number) => Promise<void>
  unsnooze: (prId: string) => Promise<void>
  markSeen: (prId: string) => Promise<void>
  getSettings: () => Promise<Settings>
  setSettings: (patch: Partial<Settings>) => Promise<void>
  addRepository: (fullName: string) => Promise<void>
  removeRepository: (fullName: string) => Promise<void>
  startAuth: () => Promise<void>
  signOut: () => Promise<void>
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/main/inbox.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Inbox } from './inbox'
import { AppStore } from './store'
import type { KeyValueStore, PersistedState } from './store'
import { DEFAULT_SETTINGS, type PullRequest } from '@shared/types'
import type { InboxSnapshot } from '@shared/ipc'
import { makePullRequest } from '@core/test-factory'

class MemoryStore implements KeyValueStore {
  private state: PersistedState = {
    settings: { ...DEFAULT_SETTINGS, repositories: ['acme/web'] },
    snoozes: {},
    seen: {},
  }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
  }
}

const NOW = '2026-08-10T12:00:00Z'
const CLIENT = (async () => ({})) as never

let store: AppStore
let changes: InboxSnapshot[]

beforeEach(() => {
  store = new AppStore(new MemoryStore())
  changes = []
})

function build(prs: PullRequest[], overrides: Record<string, unknown> = {}) {
  return new Inbox({
    store,
    getClient: () => CLIENT,
    onChange: (snapshot) => changes.push(snapshot),
    now: () => NOW,
    fetchLogin: async () => 'vlad',
    fetchPrs: async () => prs,
    ...overrides,
  })
}

describe('Inbox.refresh', () => {
  it('classifies fetched PRs and counts the ones needing attention', async () => {
    const inbox = build([
      makePullRequest({ id: 'PR_1', buckets: ['review-requested'] }),
      makePullRequest({ id: 'PR_2', authorLogin: 'vlad', buckets: ['author'] }),
    ])

    await inbox.refresh()
    const snapshot = inbox.getSnapshot()

    expect(snapshot.status).toBe('ready')
    expect(snapshot.myLogin).toBe('vlad')
    expect(snapshot.lastUpdatedAt).toBe(NOW)
    expect(snapshot.items.map((item) => item.pr.id)).toEqual(['PR_1', 'PR_2'])
    expect(snapshot.attentionCount).toBe(1)
  })

  it('reports signed-out when there is no client', async () => {
    const inbox = build([], { getClient: () => null })
    await inbox.refresh()
    expect(inbox.getSnapshot().status).toBe('signed-out')
  })

  it('keeps the previous items and reports the error when a fetch fails', async () => {
    const inbox = build([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
    await inbox.refresh()

    const failing = build([], {
      fetchPrs: async () => {
        throw new Error('rate limit exceeded')
      },
    })
    await failing.refresh()

    expect(failing.getSnapshot().status).toBe('error')
    expect(failing.getSnapshot().errorMessage).toBe('rate limit exceeded')
  })

  it('preserves the last successful update time across a failure', async () => {
    const fetchPrs = vi
      .fn()
      .mockResolvedValueOnce([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
      .mockRejectedValueOnce(new Error('network down'))
    const inbox = build([], { fetchPrs })

    await inbox.refresh()
    await inbox.refresh()

    const snapshot = inbox.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.lastUpdatedAt).toBe(NOW)
    expect(snapshot.items).toHaveLength(1)
  })

  it('notifies subscribers on every state change', async () => {
    const inbox = build([makePullRequest({ id: 'PR_1', buckets: ['review-requested'] })])
    await inbox.refresh()
    expect(changes.map((snapshot) => snapshot.status)).toEqual(['loading', 'ready'])
  })

  it('fetches the viewer login only once', async () => {
    const fetchLogin = vi.fn(async () => 'vlad')
    const inbox = build([], { fetchLogin })
    await inbox.refresh()
    await inbox.refresh()
    expect(fetchLogin).toHaveBeenCalledTimes(1)
  })
})

describe('Inbox.reclassify', () => {
  it('moves a snoozed PR to waiting without refetching', async () => {
    const fetchPrs = vi.fn(async () => [
      makePullRequest({ id: 'PR_1', buckets: ['review-requested'] }),
    ])
    const inbox = build([], { fetchPrs })
    await inbox.refresh()
    expect(inbox.getSnapshot().attentionCount).toBe(1)

    store.snooze('PR_1', 'until-time', NOW, 2)
    inbox.reclassify()

    expect(inbox.getSnapshot().items[0]!.category).toBe('waiting')
    expect(inbox.getSnapshot().attentionCount).toBe(0)
    expect(fetchPrs).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/main/inbox.test.ts`
Expected: FAIL — cannot find module `./inbox`.

- [ ] **Step 4: Write `src/main/inbox.ts`**

```ts
import { classifyAll, countAttention } from '@core/classify'
import type { InboxSnapshot } from '@shared/ipc'
import type { PullRequest } from '@shared/types'
import {
  fetchPullRequests,
  fetchViewerLogin,
  type GraphQLClient,
} from './github/fetch-prs'
import type { AppStore } from './store'

export interface InboxDeps {
  store: AppStore
  /** Returns null while the user is signed out. */
  getClient: () => GraphQLClient | null
  onChange: (snapshot: InboxSnapshot) => void
  now?: () => string
  fetchPrs?: typeof fetchPullRequests
  fetchLogin?: typeof fetchViewerLogin
}

export class Inbox {
  private snapshot: InboxSnapshot = {
    status: 'signed-out',
    items: [],
    attentionCount: 0,
    lastUpdatedAt: null,
    errorMessage: null,
    myLogin: null,
    seen: {},
  }

  private prs: PullRequest[] = []
  private myLogin: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly now: () => string
  private readonly fetchPrs: typeof fetchPullRequests
  private readonly fetchLogin: typeof fetchViewerLogin

  constructor(private readonly deps: InboxDeps) {
    this.now = deps.now ?? (() => new Date().toISOString())
    this.fetchPrs = deps.fetchPrs ?? fetchPullRequests
    this.fetchLogin = deps.fetchLogin ?? fetchViewerLogin
  }

  getSnapshot(): InboxSnapshot {
    return this.snapshot
  }

  private emit(patch: Partial<InboxSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.deps.onChange(this.snapshot)
  }

  /** Re-runs the classifier over PRs already in memory. No network. */
  reclassify(): void {
    if (this.myLogin === null) return
    const items = classifyAll(this.prs, {
      myLogin: this.myLogin,
      snoozes: this.deps.store.getSnoozes(),
      now: this.now(),
    })
    this.emit({
      items,
      attentionCount: countAttention(items),
      seen: this.deps.store.getSeen(),
    })
  }

  async refresh(): Promise<void> {
    const client = this.deps.getClient()
    if (client === null) {
      this.emit({ status: 'signed-out', items: [], attentionCount: 0 })
      return
    }

    this.emit({ status: 'loading', errorMessage: null })

    try {
      this.myLogin ??= await this.fetchLogin(client)
      this.prs = await this.fetchPrs(
        client,
        this.deps.store.getSettings().repositories,
      )

      const now = this.now()
      const items = classifyAll(this.prs, {
        myLogin: this.myLogin,
        snoozes: this.deps.store.getSnoozes(),
        now,
      })

      this.emit({
        status: 'ready',
        items,
        attentionCount: countAttention(items),
        lastUpdatedAt: now,
        errorMessage: null,
        myLogin: this.myLogin,
        seen: this.deps.store.getSeen(),
      })
    } catch (error) {
      // Keep the last good list on screen; the header shows the staleness.
      this.emit({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  start(): void {
    this.stop()
    const minutes = this.deps.store.getSettings().pollIntervalMinutes
    this.timer = setInterval(() => void this.refresh(), minutes * 60_000)
    void this.refresh()
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/main/inbox.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add inbox snapshot state and polling"
```

---

### Task 11: Tray, popup window, and app wiring

After this task the app runs end to end against real GitHub, with no UI beyond the placeholder heading.

**Files:**
- Create: `src/main/window.ts`
- Create: `src/main/tray.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts` (replace the Task 1 placeholder entirely)
- Modify: `src/preload/index.ts` (replace the Task 1 placeholder entirely)
- Create: `src/renderer/src/env.d.ts`

**Interfaces:**
- Consumes: `Inbox` from `./inbox`; `AppStore`, `createAppStore` from `./store`; `createGraphQLClient` from `./github/fetch-prs`; `pollForToken`, `requestDeviceCode` from `./auth/device-flow`; `clearToken`, `loadToken`, `saveToken` from `./auth/token-storage`; `IPC`, `RendererApi` from `@shared/ipc`.
- Produces:
  - `createPopupWindow(): BrowserWindow` and `togglePopup(win, trayBounds)` from `./window`
  - `createTray(onToggle: (bounds: Electron.Rectangle) => void, onQuit: () => void): Tray` and `setBadge(tray: Tray, count: number): void` from `./tray`
  - `registerIpc(deps: IpcDeps): void` from `./ipc`
  - `window.api: RendererApi` in the renderer

The tray uses an empty image plus `setTitle`, so the app ships with no icon asset. A drawn icon is deliberate future polish.

- [ ] **Step 1: Write `src/main/window.ts`**

```ts
import { join } from 'node:path'
import { BrowserWindow, screen, shell, type Rectangle } from 'electron'

const WIDTH = 420
const HEIGHT = 620

export function createPopupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  // Links inside the renderer always open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}

/** Centres the popup under the tray item, clamped to the display. */
export function togglePopup(win: BrowserWindow, trayBounds: Rectangle): void {
  if (win.isVisible()) {
    win.hide()
    return
  }

  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  })
  const x = Math.round(
    Math.min(
      Math.max(trayBounds.x + trayBounds.width / 2 - WIDTH / 2, display.workArea.x),
      display.workArea.x + display.workArea.width - WIDTH,
    ),
  )
  const y = Math.round(trayBounds.y + trayBounds.height)

  win.setPosition(x, y, false)
  win.show()
  win.focus()
}
```

- [ ] **Step 2: Write `src/main/tray.ts`**

```ts
import { Menu, Tray, nativeImage, type Rectangle } from 'electron'

export function createTray(
  onToggle: (bounds: Rectangle) => void,
  onQuit: () => void,
): Tray {
  // An empty image plus a title renders as a text-only menu-bar item, which
  // means the app ships without an icon asset.
  const tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('GitHub Review Inbox')
  tray.setTitle('PR —')

  tray.on('click', (_event, bounds) => onToggle(bounds))
  tray.on('right-click', () => {
    tray.popUpContextMenu(
      Menu.buildFromTemplate([{ label: 'Выйти', click: onQuit }]),
    )
  })

  return tray
}

export function setBadge(tray: Tray, count: number): void {
  tray.setTitle(count > 0 ? `PR ${count}` : 'PR —')
}
```

- [ ] **Step 3: Write `src/main/ipc.ts`**

```ts
import { BrowserWindow, ipcMain, shell } from 'electron'
import { IPC, type DeviceCodePayload } from '@shared/ipc'
import type { Settings, SnoozeType } from '@shared/types'
import type { Inbox } from './inbox'
import type { AppStore } from './store'

export interface IpcDeps {
  inbox: Inbox
  store: AppStore
  getWindow: () => BrowserWindow | null
  signIn: (onDeviceCode: (payload: DeviceCodePayload) => void) => Promise<void>
  signOut: () => void
  restartPolling: () => void
}

export function registerIpc(deps: IpcDeps): void {
  const now = (): string => new Date().toISOString()

  ipcMain.handle(IPC.getSnapshot, () => deps.inbox.getSnapshot())
  ipcMain.handle(IPC.refresh, () => deps.inbox.refresh())

  ipcMain.handle(IPC.openPr, (_event, url: string) => shell.openExternal(url))

  ipcMain.handle(
    IPC.snooze,
    (_event, prId: string, type: SnoozeType, hours?: number) => {
      deps.store.snooze(prId, type, now(), hours)
      deps.inbox.reclassify()
    },
  )

  ipcMain.handle(IPC.unsnooze, (_event, prId: string) => {
    deps.store.unsnooze(prId)
    deps.inbox.reclassify()
  })

  ipcMain.handle(IPC.markSeen, (_event, prId: string) => {
    deps.store.markSeen(prId, now())
    deps.inbox.reclassify()
  })

  ipcMain.handle(IPC.getSettings, () => deps.store.getSettings())

  ipcMain.handle(IPC.setSettings, (_event, patch: Partial<Settings>) => {
    deps.store.updateSettings(patch)
    if (patch.pollIntervalMinutes !== undefined) deps.restartPolling()
  })

  ipcMain.handle(IPC.addRepository, async (_event, fullName: string) => {
    deps.store.addRepository(fullName)
    await deps.inbox.refresh()
  })

  ipcMain.handle(IPC.removeRepository, async (_event, fullName: string) => {
    deps.store.removeRepository(fullName)
    await deps.inbox.refresh()
  })

  ipcMain.handle(IPC.startAuth, () =>
    deps.signIn((payload) => {
      deps.getWindow()?.webContents.send(IPC.deviceCode, payload)
    }),
  )

  ipcMain.handle(IPC.signOut, () => deps.signOut())
}
```

- [ ] **Step 4: Rewrite `src/main/index.ts`**

```ts
import { app, clipboard, shell, type BrowserWindow, type Tray } from 'electron'
import { pollForToken, requestDeviceCode } from './auth/device-flow'
import { clearToken, loadToken, saveToken } from './auth/token-storage'
import { createGraphQLClient, type GraphQLClient } from './github/fetch-prs'
import { Inbox } from './inbox'
import { registerIpc } from './ipc'
import { createAppStore } from './store'
import { createTray, setBadge } from './tray'
import { createPopupWindow, togglePopup } from './window'
import { IPC } from '@shared/ipc'

const CLIENT_ID = import.meta.env.MAIN_VITE_GITHUB_CLIENT_ID as string | undefined

/** Opening the popup refetches when the data on screen is older than this. */
const STALE_AFTER_MS = 60_000

let window: BrowserWindow | null = null
let tray: Tray | null = null
let client: GraphQLClient | null = null

const store = createAppStore()

const inbox = new Inbox({
  store,
  getClient: () => client,
  onChange: (snapshot) => {
    window?.webContents.send(IPC.snapshotChanged, snapshot)
    if (tray !== null) setBadge(tray, snapshot.attentionCount)
  },
})

function loadClientFromDisk(): void {
  const token = loadToken()
  client = token === null ? null : createGraphQLClient(token)
}

function isStale(): boolean {
  const last = inbox.getSnapshot().lastUpdatedAt
  return last === null || Date.now() - Date.parse(last) > STALE_AFTER_MS
}

async function signIn(
  onDeviceCode: (payload: { userCode: string; verificationUri: string }) => void,
): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('MAIN_VITE_GITHUB_CLIENT_ID не задан — заполни .env')
  }

  const info = await requestDeviceCode(CLIENT_ID)
  onDeviceCode({
    userCode: info.userCode,
    verificationUri: info.verificationUri,
  })
  // The user has to type the code, so hand it to them via the clipboard too.
  clipboard.writeText(info.userCode)
  await shell.openExternal(info.verificationUri)

  const token = await pollForToken(CLIENT_ID, info)
  saveToken(token)
  client = createGraphQLClient(token)
  inbox.start()
}

function signOut(): void {
  clearToken()
  client = null
  inbox.stop()
  void inbox.refresh()
}

app.dock?.hide()

void app.whenReady().then(() => {
  loadClientFromDisk()
  window = createPopupWindow()

  tray = createTray(
    (bounds) => {
      if (window === null) return
      const opening = !window.isVisible()
      togglePopup(window, bounds)
      // Opening onto a stale list is the one moment worth spending a fetch on.
      if (opening && client !== null && isStale()) void inbox.refresh()
    },
    () => app.quit(),
  )

  registerIpc({
    inbox,
    store,
    getWindow: () => window,
    signIn,
    signOut,
    restartPolling: () => inbox.start(),
  })

  if (client !== null) inbox.start()
})

// The app lives in the menu bar, so closing the popup must not quit it.
app.on('window-all-closed', () => {})
```

- [ ] **Step 5: Rewrite `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type DeviceCodePayload,
  type InboxSnapshot,
  type RendererApi,
} from '@shared/ipc'
import type { Settings, SnoozeType } from '@shared/types'

function subscribe<T>(
  channel: string,
  listener: (payload: T) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void =>
    listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const api: RendererApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  onSnapshot: (listener: (snapshot: InboxSnapshot) => void) =>
    subscribe(IPC.snapshotChanged, listener),
  onDeviceCode: (listener: (payload: DeviceCodePayload) => void) =>
    subscribe(IPC.deviceCode, listener),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  openPr: (url: string) => ipcRenderer.invoke(IPC.openPr, url),
  snooze: (prId: string, type: SnoozeType, hours?: number) =>
    ipcRenderer.invoke(IPC.snooze, prId, type, hours),
  unsnooze: (prId: string) => ipcRenderer.invoke(IPC.unsnooze, prId),
  markSeen: (prId: string) => ipcRenderer.invoke(IPC.markSeen, prId),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke(IPC.setSettings, patch),
  addRepository: (fullName: string) =>
    ipcRenderer.invoke(IPC.addRepository, fullName),
  removeRepository: (fullName: string) =>
    ipcRenderer.invoke(IPC.removeRepository, fullName),
  startAuth: () => ipcRenderer.invoke(IPC.startAuth),
  signOut: () => ipcRenderer.invoke(IPC.signOut),
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 6: Declare the renderer globals**

Create `src/renderer/src/env.d.ts`:

```ts
/// <reference types="vite/client" />

import type { RendererApi } from '@shared/ipc'

declare global {
  interface Window {
    api: RendererApi
  }
}

export {}
```

- [ ] **Step 7: Verify the app boots into the menu bar**

Run: `npm run dev`
Expected: no Dock icon; a `PR —` item appears in the menu bar; clicking it opens a small frameless window showing the Task 1 heading; clicking elsewhere hides it; right-click offers "Выйти". Quit with Ctrl+C.

Signed out there is nothing to refresh yet — the stale-on-open refetch is exercised in the Task 15 checklist.

- [ ] **Step 8: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add tray, popup window and IPC wiring"
```

---

### Task 12: Renderer shell and sign-in screen

**Files:**
- Create: `src/core/format.ts`
- Test: `src/core/format.test.ts`
- Create: `src/renderer/src/useSnapshot.ts`
- Create: `src/renderer/src/components/SignIn.tsx`
- Modify: `src/renderer/src/main.tsx` (add the Reshaped provider and stylesheets)
- Modify: `src/renderer/src/App.tsx` (replace the Task 1 placeholder entirely)

**Interfaces:**
- Consumes: `RendererApi`, `InboxSnapshot`, `DeviceCodePayload` from `@shared/ipc`.
- Produces:
  - `formatAge(iso: string, now: string): string` and `formatDiff(additions: number, deletions: number): string` from `@core/format`
  - `useSnapshot(): InboxSnapshot` from `./useSnapshot`
  - `SignIn` component

Reshaped needs two stylesheets: the theme tokens and the component bundle. Components are imported from `reshaped/bundle`, which is the entry the CSS bundle matches.

- [ ] **Step 1: Write the failing formatting tests**

Create `src/core/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatAge, formatDiff } from '@core/format'

const NOW = '2026-08-10T12:00:00Z'

describe('formatAge', () => {
  it('reports minutes under an hour', () => {
    expect(formatAge('2026-08-10T11:30:00Z', NOW)).toBe('30 мин назад')
  })

  it('reports "только что" under a minute', () => {
    expect(formatAge('2026-08-10T11:59:30Z', NOW)).toBe('только что')
  })

  it('reports hours under a day', () => {
    expect(formatAge('2026-08-10T09:00:00Z', NOW)).toBe('3 ч назад')
  })

  it('reports days beyond a day', () => {
    expect(formatAge('2026-08-05T12:00:00Z', NOW)).toBe('5 дн назад')
  })

  it('clamps a future timestamp to "только что"', () => {
    expect(formatAge('2026-08-10T13:00:00Z', NOW)).toBe('только что')
  })
})

describe('formatDiff', () => {
  it('renders both sides', () => {
    expect(formatDiff(12, 3)).toBe('+12 −3')
  })

  it('renders zeroes', () => {
    expect(formatDiff(0, 0)).toBe('+0 −0')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/format.test.ts`
Expected: FAIL — `Failed to resolve import "@core/format"`.

- [ ] **Step 3: Write `src/core/format.ts`**

```ts
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatAge(iso: string, now: string): string {
  const elapsed = Date.parse(now) - Date.parse(iso)
  if (elapsed < MINUTE) return 'только что'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} мин назад`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} ч назад`
  return `${Math.floor(elapsed / DAY)} дн назад`
}

export function formatDiff(additions: number, deletions: number): string {
  return `+${additions} −${deletions}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/format.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write `src/renderer/src/useSnapshot.ts`**

```ts
import { useEffect, useState } from 'react'
import type { InboxSnapshot } from '@shared/ipc'

const EMPTY: InboxSnapshot = {
  status: 'loading',
  items: [],
  attentionCount: 0,
  lastUpdatedAt: null,
  errorMessage: null,
  myLogin: null,
  seen: {},
}

export function useSnapshot(): InboxSnapshot {
  const [snapshot, setSnapshot] = useState<InboxSnapshot>(EMPTY)

  useEffect(() => {
    void window.api.getSnapshot().then(setSnapshot)
    return window.api.onSnapshot(setSnapshot)
  }, [])

  return snapshot
}
```

- [ ] **Step 6: Write `src/renderer/src/components/SignIn.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Button, Text, View } from 'reshaped/bundle'
import type { DeviceCodePayload } from '@shared/ipc'

export default function SignIn(): React.JSX.Element {
  const [code, setCode] = useState<DeviceCodePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => window.api.onDeviceCode(setCode), [])

  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.api.startAuth()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setCode(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View padding={6} gap={4} align="center" justify="center" height="100%">
      <Text variant="featured-3" weight="bold">
        GitHub Review Inbox
      </Text>

      {code === null ? (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Войди через GitHub, чтобы увидеть свои PRы.
          </Text>
          <Button color="primary" loading={busy} onClick={() => void start()}>
            Войти через GitHub
          </Button>
        </>
      ) : (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Введи этот код на {code.verificationUri} — он уже скопирован в буфер.
          </Text>
          <Text variant="featured-2" weight="bold" monospace>
            {code.userCode}
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            Ждём подтверждения…
          </Text>
        </>
      )}

      {error !== null && (
        <Text variant="caption-1" color="critical" align="center">
          {error}
        </Text>
      )}
    </View>
  )
}
```

- [ ] **Step 7: Rewrite `src/renderer/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Reshaped } from 'reshaped/bundle'
import 'reshaped/themes/slate/theme.css'
import 'reshaped/bundle.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Reshaped theme="slate" defaultColorMode="dark">
      <App />
    </Reshaped>
  </StrictMode>,
)
```

- [ ] **Step 8: Rewrite `src/renderer/src/App.tsx`**

```tsx
import { Loader, View } from 'reshaped/bundle'
import SignIn from './components/SignIn'
import { useSnapshot } from './useSnapshot'

export default function App(): React.JSX.Element {
  const snapshot = useSnapshot()

  if (snapshot.status === 'signed-out') return <SignIn />

  if (snapshot.status === 'loading' && snapshot.items.length === 0) {
    return (
      <View height="100%" align="center" justify="center">
        <Loader size="medium" />
      </View>
    )
  }

  return (
    <View padding={4}>
      <pre>{JSON.stringify(snapshot.items.length, null, 2)}</pre>
    </View>
  )
}
```

- [ ] **Step 9: Verify the sign-in screen renders**

Run: `npm run dev`
Expected: clicking the menu-bar item shows the styled sign-in screen on a dark background. With a real `MAIN_VITE_GITHUB_CLIENT_ID` in `.env`, clicking "Войти через GitHub" opens the browser, shows a device code, and after approval the window switches to the placeholder PR count. Quit with Ctrl+C.

- [ ] **Step 10: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add renderer shell, formatting helpers and sign-in screen"
```

---

### Task 13: Inbox list

**Files:**
- Create: `src/renderer/src/components/PullRequestCard.tsx`
- Create: `src/renderer/src/components/SnoozeMenu.tsx`
- Create: `src/renderer/src/components/InboxSection.tsx`
- Create: `src/renderer/src/components/Header.tsx`
- Modify: `src/renderer/src/App.tsx` (replace the Task 12 placeholder body)

**Interfaces:**
- Consumes: `formatAge`, `formatDiff` from `@core/format`; `CATEGORY_TITLES`, `VISIBLE_CATEGORIES`, `ClassifiedPullRequest`, `Category` from `@shared/types`; `useSnapshot`.
- Produces: `PullRequestCard`, `SnoozeMenu`, `InboxSection`, `Header` components.

A PR is "new" when the user has never marked it seen, or when it changed after they did — that draws the unread dot.

- [ ] **Step 1: Write `src/renderer/src/components/SnoozeMenu.tsx`**

```tsx
import { Button, DropdownMenu } from 'reshaped/bundle'
import type { SnoozeType } from '@shared/types'

interface Props {
  prId: string
  isSnoozed: boolean
}

const OPTIONS: Array<{ label: string; type: SnoozeType; hours?: number }> = [
  { label: 'До ответа в моих тредах', type: 'until-reply' },
  { label: 'До новых коммитов', type: 'until-new-commits' },
  { label: 'На 4 часа', type: 'until-time', hours: 4 },
  { label: 'До завтра', type: 'until-time', hours: 24 },
]

export default function SnoozeMenu({ prId, isSnoozed }: Props): React.JSX.Element {
  if (isSnoozed) {
    return (
      <Button
        size="small"
        variant="ghost"
        onClick={() => void window.api.unsnooze(prId)}
      >
        Вернуть
      </Button>
    )
  }

  return (
    <DropdownMenu position="bottom-end">
      <DropdownMenu.Trigger>
        {(attributes) => (
          <Button size="small" variant="ghost" attributes={attributes}>
            Отложить
          </Button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {OPTIONS.map((option) => (
          <DropdownMenu.Item
            key={option.label}
            onClick={() => void window.api.snooze(prId, option.type, option.hours)}
          >
            {option.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Write `src/renderer/src/components/PullRequestCard.tsx`**

```tsx
import { Actionable, Avatar, Badge, Button, Card, Text, View } from 'reshaped/bundle'
import { formatAge, formatDiff } from '@core/format'
import type { ClassifiedPullRequest } from '@shared/types'
import SnoozeMenu from './SnoozeMenu'

interface Props {
  item: ClassifiedPullRequest
  seenAt: string | undefined
  now: string
}

const CI_LABELS = {
  success: { label: 'CI ok', color: 'positive' },
  failure: { label: 'CI упал', color: 'critical' },
  pending: { label: 'CI идёт', color: 'warning' },
} as const

export default function PullRequestCard({
  item,
  seenAt,
  now,
}: Props): React.JSX.Element {
  const { pr } = item
  const isNew = seenAt === undefined || seenAt < pr.updatedAt
  const ci = pr.ciStatus === 'none' ? null : CI_LABELS[pr.ciStatus]

  const open = (): void => {
    void window.api.openPr(pr.url)
    void window.api.markSeen(pr.id)
  }

  return (
    <Card padding={3}>
      <View gap={2}>
        <View direction="row" gap={2} align="center">
          {isNew && <Badge color="primary" size="small" rounded />}
          <Text variant="caption-1" color="neutral-faded">
            {pr.repository} #{pr.number}
          </Text>
          <View grow />
          <Text variant="caption-1" color="neutral-faded">
            {formatAge(pr.updatedAt, now)}
          </Text>
        </View>

        <Actionable onClick={open}>
          <Text variant="body-2" weight="medium" maxLines={2} align="start">
            {pr.title}
          </Text>
        </Actionable>

        <View direction="row" gap={2} align="center">
          <Avatar src={pr.authorAvatarUrl} size={5} initials={pr.authorLogin[0]} />
          <Text variant="caption-1" color="neutral-faded">
            {pr.authorLogin}
          </Text>
          <Text variant="caption-1" color="neutral-faded" monospace>
            {formatDiff(pr.additions, pr.deletions)}
          </Text>
          {ci !== null && (
            <Badge color={ci.color} size="small" variant="faded">
              {ci.label}
            </Badge>
          )}
        </View>

        <View direction="row" gap={2} align="center">
          <Text variant="caption-1" color="primary">
            {item.reason}
          </Text>
          <View grow />
          {isNew && (
            <Button
              size="small"
              variant="ghost"
              onClick={() => void window.api.markSeen(pr.id)}
            >
              Прочитано
            </Button>
          )}
          <SnoozeMenu prId={pr.id} isSnoozed={item.isSnoozed} />
        </View>
      </View>
    </Card>
  )
}
```

- [ ] **Step 3: Write `src/renderer/src/components/InboxSection.tsx`**

```tsx
import { Actionable, Badge, Text, useToggle, View } from 'reshaped/bundle'
import { CATEGORY_TITLES, type Category, type ClassifiedPullRequest } from '@shared/types'
import PullRequestCard from './PullRequestCard'

interface Props {
  category: Category
  items: ClassifiedPullRequest[]
  seen: Record<string, string>
  now: string
  /** The waiting section starts collapsed; attention sections start open. */
  defaultCollapsed: boolean
}

export default function InboxSection({
  category,
  items,
  seen,
  now,
  defaultCollapsed,
}: Props): React.JSX.Element | null {
  const { active: open, toggle } = useToggle(!defaultCollapsed)

  if (items.length === 0) return null

  return (
    <View gap={2}>
      <Actionable onClick={toggle}>
        <View direction="row" gap={2} align="center" paddingBlock={1}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            {CATEGORY_TITLES[category].toUpperCase()}
          </Text>
          <Badge size="small" variant="faded">
            {items.length}
          </Badge>
          <View grow />
          <Text variant="caption-1" color="neutral-faded">
            {open ? '▾' : '▸'}
          </Text>
        </View>
      </Actionable>

      {open &&
        items.map((item) => (
          <PullRequestCard
            key={item.pr.id}
            item={item}
            seenAt={seen[item.pr.id]}
            now={now}
          />
        ))}
    </View>
  )
}
```

- [ ] **Step 4: Write `src/renderer/src/components/Header.tsx`**

```tsx
import { useState } from 'react'
import { Button, Text, View } from 'reshaped/bundle'
import { formatAge } from '@core/format'
import type { InboxSnapshot } from '@shared/ipc'

interface Props {
  snapshot: InboxSnapshot
  now: string
  onOpenSettings: () => void
}

export default function Header({
  snapshot,
  now,
  onOpenSettings,
}: Props): React.JSX.Element {
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.refresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View
      direction="row"
      gap={2}
      align="center"
      padding={3}
      borderColor="neutral-faded"
      borderBottom
    >
      <View gap={0}>
        <Text variant="body-2" weight="bold">
          {snapshot.attentionCount > 0
            ? `${snapshot.attentionCount} требуют внимания`
            : 'Всё чисто'}
        </Text>
        <Text
          variant="caption-2"
          color={snapshot.errorMessage === null ? 'neutral-faded' : 'critical'}
        >
          {snapshot.errorMessage ??
            (snapshot.lastUpdatedAt === null
              ? 'Ещё не обновлялось'
              : `Обновлено ${formatAge(snapshot.lastUpdatedAt, now)}`)}
        </Text>
      </View>

      <View grow />

      <Button
        size="small"
        variant="ghost"
        loading={refreshing}
        onClick={() => void refresh()}
      >
        Обновить
      </Button>
      <Button size="small" variant="ghost" onClick={onOpenSettings}>
        Настройки
      </Button>
    </View>
  )
}
```

- [ ] **Step 5: Rewrite `src/renderer/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Loader, Text, View } from 'reshaped/bundle'
import { VISIBLE_CATEGORIES } from '@shared/types'
import Header from './components/Header'
import InboxSection from './components/InboxSection'
import SignIn from './components/SignIn'
import { useSnapshot } from './useSnapshot'

export default function App(): React.JSX.Element {
  const snapshot = useSnapshot()
  const [showSettings, setShowSettings] = useState(false)
  const [now, setNow] = useState(() => new Date().toISOString())

  // Keeps the relative ages honest without re-fetching anything.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (snapshot.status === 'signed-out') return <SignIn />

  if (snapshot.status === 'loading' && snapshot.items.length === 0) {
    return (
      <View height="100%" align="center" justify="center">
        <Loader size="medium" />
      </View>
    )
  }

  return (
    <View height="100vh">
      <Header
        snapshot={snapshot}
        now={now}
        onOpenSettings={() => setShowSettings(true)}
      />

      <View overflow="auto" grow padding={3} gap={4}>
        {snapshot.items.length === 0 ? (
          <View align="center" justify="center" grow gap={2}>
            <Text variant="body-2" color="neutral-faded">
              Нечего смотреть
            </Text>
            <Text variant="caption-1" color="neutral-faded" align="center">
              Добавь репозитории в настройках, если список должен быть не пустым.
            </Text>
          </View>
        ) : (
          VISIBLE_CATEGORIES.map((category) => (
            <InboxSection
              key={category}
              category={category}
              items={snapshot.items.filter((item) => item.category === category)}
              seen={snapshot.seen}
              now={now}
              defaultCollapsed={category === 'waiting'}
            />
          ))
        )}
      </View>

    </View>
  )
}
```

Note: `showSettings` is declared and toggled here but nothing reads it yet — Task 14 adds the branch that renders the panel. `Header` needs somewhere to point, so the state lands in this task.

- [ ] **Step 6: Verify the inbox renders against real data**

Run: `npm run dev`
Expected: after signing in and adding at least one repository (do it by hand for now — edit the `settings.repositories` array in `~/Library/Application Support/github-review-inbox/github-review-inbox.json`, then restart), the popup lists PRs grouped under the Russian section headings, the "Ждёшь ответа" section starts collapsed, "Обновить" refreshes, and clicking a title opens the PR in the browser. Quit with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: render the categorised inbox list"
```

---

### Task 14: Settings panel

**Files:**
- Create: `src/renderer/src/components/SettingsPanel.tsx`
- Modify: `src/renderer/src/App.tsx` (replace the Task 13 placeholder `<div hidden data-pending-task="14" />`)

**Interfaces:**
- Consumes: `Settings` from `@shared/types`; `window.api.getSettings/setSettings/addRepository/removeRepository/signOut`.
- Produces: `SettingsPanel` component with props `{ onClose: () => void }`.

Reshaped's `TextField` calls `onChange` with `{ value }`, not a DOM event.

- [ ] **Step 1: Write `src/renderer/src/components/SettingsPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Button, Card, Text, TextField, View } from 'reshaped/bundle'
import type { Settings } from '@shared/types'

interface Props {
  onClose: () => void
}

const INTERVAL_OPTIONS = [1, 5, 15, 30]

export default function SettingsPanel({ onClose }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setSettings(await window.api.getSettings())
  }

  useEffect(() => {
    void reload()
  }, [])

  const addRepository = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.addRepository(draft)
      setDraft('')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const removeRepository = async (fullName: string): Promise<void> => {
    await window.api.removeRepository(fullName)
    await reload()
  }

  const setInterval = async (minutes: number): Promise<void> => {
    await window.api.setSettings({ pollIntervalMinutes: minutes })
    await reload()
  }

  if (settings === null) return <View padding={4} />

  return (
    <View height="100vh" backgroundColor="page">
      <View
        direction="row"
        align="center"
        padding={3}
        borderColor="neutral-faded"
        borderBottom
      >
        <Text variant="body-2" weight="bold">
          Настройки
        </Text>
        <View grow />
        <Button size="small" variant="ghost" onClick={onClose}>
          Готово
        </Button>
      </View>

      <View overflow="auto" grow padding={3} gap={5}>
        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            РЕПОЗИТОРИИ
          </Text>

          <View direction="row" gap={2}>
            <View grow>
              <TextField
                name="repository"
                value={draft}
                placeholder="owner/repo"
                size="small"
                onChange={({ value }) => setDraft(value)}
                inputAttributes={{
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') void addRepository()
                  },
                }}
              />
            </View>
            <Button
              size="small"
              color="primary"
              disabled={draft.trim() === ''}
              onClick={() => void addRepository()}
            >
              Добавить
            </Button>
          </View>

          {error !== null && (
            <Text variant="caption-1" color="critical">
              {error}
            </Text>
          )}

          {settings.repositories.length === 0 ? (
            <Text variant="caption-1" color="neutral-faded">
              Пока ни одного — инбокс будет пустым.
            </Text>
          ) : (
            settings.repositories.map((repo) => (
              <Card key={repo} padding={2}>
                <View direction="row" align="center" gap={2}>
                  <Text variant="caption-1">{repo}</Text>
                  <View grow />
                  <Button
                    size="small"
                    variant="ghost"
                    color="critical"
                    onClick={() => void removeRepository(repo)}
                  >
                    Убрать
                  </Button>
                </View>
              </Card>
            ))
          )}
        </View>

        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            ЧАСТОТА ОБНОВЛЕНИЯ
          </Text>
          <View direction="row" gap={2}>
            {INTERVAL_OPTIONS.map((minutes) => (
              <Button
                key={minutes}
                size="small"
                variant={
                  settings.pollIntervalMinutes === minutes ? 'solid' : 'outline'
                }
                onClick={() => void setInterval(minutes)}
              >
                {minutes} мин
              </Button>
            ))}
          </View>
        </View>

        <View gap={2}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            АККАУНТ
          </Text>
          <View direction="row">
            <Button
              size="small"
              variant="outline"
              color="critical"
              onClick={() => void window.api.signOut()}
            >
              Выйти из GitHub
            </Button>
          </View>
        </View>
      </View>
    </View>
  )
}
```

- [ ] **Step 2: Wire the panel into `src/renderer/src/App.tsx`**

Add the import next to the other component imports:

```tsx
import SettingsPanel from './components/SettingsPanel'
```

Add an early return immediately after the `signed-out` check, so the panel replaces the list rather than overlaying it:

```tsx
  if (showSettings) {
    return <SettingsPanel onClose={() => setShowSettings(false)} />
  }
```

The final ordering of the checks inside `App` is: `signed-out` → `showSettings` → `loading` → the list. This is what makes Task 13's `showSettings` state load-bearing.

- [ ] **Step 3: Verify settings work end to end**

Run: `npm run dev`
Expected: "Настройки" opens the panel; typing `owner/repo` and pressing Enter adds it and the inbox refetches; typing `nonsense` shows the `owner/repo` format error; "Убрать" removes a repository; changing the interval persists across a restart; "Выйти из GitHub" returns to the sign-in screen. Quit with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "feat: add settings panel for repositories and poll interval"
```

---

### Task 15: Packaging

**Files:**
- Create: `electron-builder.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: the `dist` script added in Task 1.
- Produces: a runnable `.app` in `dist/`.

The app is unsigned, so macOS Gatekeeper needs a one-time right-click → Open. That is expected for a personal build and is documented in the README rather than worked around.

- [ ] **Step 1: Write `electron-builder.yml`**

```yaml
appId: net.variant.github-review-inbox
productName: GitHub Review Inbox
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json
mac:
  target:
    - dmg
    - dir
  category: public.app-category.developer-tools
  # A menu-bar-only app: no Dock icon, no app switcher entry.
  extendInfo:
    LSUIElement: true
  identity: null
```

- [ ] **Step 2: Build the app**

Run: `npm run dist`
Expected: completes and writes `dist/mac-arm64/GitHub Review Inbox.app` (or `dist/mac/` on Intel).

- [ ] **Step 3: Verify the packaged app runs**

Run: `open "dist/mac-arm64/GitHub Review Inbox.app"`
Expected: the menu-bar item appears with no Dock icon; the popup opens and shows either the sign-in screen or the inbox. If Gatekeeper blocks it, right-click the `.app` in Finder → Open → Open.

- [ ] **Step 4: Write `README.md`**

```markdown
# GitHub Review Inbox

Menu-bar инбокс для code review: показывает только те PRы, которые сейчас ждут
твоего действия, и прячет те, где ты ждёшь других.

## Настройка

1. Зарегистрируй OAuth App на https://github.com/settings/developers
   и включи у него **Device Flow**.
2. Скопируй `.env.example` в `.env` и вставь Client ID.
3. `npm install`
4. `npm run dev`

## Сборка

```bash
npm run dist
```

Сборка не подписана, поэтому при первом запуске: правый клик по `.app` в
Finder → Open → Open.

## Разработка

- `npm test` — юнит-тесты (вся логика классификации в `src/core/`)
- `npm run typecheck` — проверка типов

Спека: `docs/superpowers/specs/2026-08-31-github-review-inbox-design.md`
```

- [ ] **Step 5: Commit**

```bash
npm test && npm run typecheck
git add -A
git commit -m "chore: add packaging config and README"
```

---

## Verification Checklist

Run through this after Task 15 against a real GitHub account with at least two
tracked repositories.

- [ ] A PR where you are a requested reviewer and have not touched appears under **Нужно ревью**.
- [ ] After you leave a comment on it, it leaves that section and lands in **Ждёшь ответа**.
- [ ] When the author replies to your thread, it moves to **Новые ответы тебе** and the badge count goes up.
- [ ] Resolving that thread on github.com makes the PR drop back out of **Новые ответы тебе** on the next refresh.
- [ ] After you review and the author pushes a commit, the PR appears under **Re-review**.
- [ ] One of your own PRs with an unanswered reviewer comment appears under **Твои PRы**.
- [ ] Your own PR with all approvals shows "Апрувнут — можно мержить".
- [ ] Snoozing a PR "на 4 часа" moves it to **Ждёшь ответа**, marks it snoozed, and drops the badge count.
- [ ] "Вернуть" on a snoozed PR restores its original section immediately, with no refetch.
- [ ] A draft PR never appears anywhere.
- [ ] Killing your network shows the error line in the header while the previous list stays on screen.
- [ ] "Обновить" refetches on demand; the header's "Обновлено N мин назад" updates.
- [ ] Closing the popup, waiting more than a minute, and reopening it triggers a refetch on its own; reopening it straight away does not.
- [ ] A PR you have not opened shows the unread dot and a "Прочитано" button; clicking it clears both without opening the browser.
