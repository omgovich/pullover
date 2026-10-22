import { makePullRequest } from '@core/test-factory'
import type { InboxSnapshot } from '@shared/ipc'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { Reshaped } from 'reshaped/bundle'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import App from './App'
import { stubApi } from './test/app-api'
import { AVATAR_SRC, makeItem } from './test/visual'
import type { ColorMode } from './useColorMode'

/**
 * Inbox zero, which is the one arrangement no single component holds: the
 * empty state takes the room the list isn't using, so the collapsed `waiting`
 * section ends up on the bottom edge of the scroll area — and gives that room
 * back the moment the section is opened. Both facts live in the shell (the
 * flex column in pullover.css and `EmptyState`'s `grow`), so this renders a
 * real `App` at the popup's real size rather than a component on its own.
 *
 * The list here is deliberately just long enough to overflow when opened;
 * with fewer rows the second case would be indistinguishable from the first.
 */

/** `CARD_WIDTH` and `CARD_HEIGHT` in src/main/window.ts. */
const SHELL_WIDTH_PX = 440
const SHELL_HEIGHT_PX = 620

const COLOR_MODES: readonly ColorMode[] = ['light', 'dark']

const HOUR_MS = 3_600_000

/** Long enough that opening the section overflows the popup. */
const TITLES = [
  'Retry the token refresh',
  'Drop the legacy poller',
  'Widen the repository filter',
  'Cache the classifier',
  'Bump electron to 44',
  'Tidy the snooze migration',
  'Split the fetch queue',
]

/**
 * Nothing waiting on the user, and a `waiting` section long enough to overflow
 * the popup once it's opened.
 *
 * Ages are offsets from `now` rather than the fixed clock the component cases
 * use, for the reason `demoSnapshot` gives: `App` reads its own clock and
 * nothing here can hand it one, while an offset still renders a constant.
 */
function inboxZero(now: number): InboxSnapshot {
  return {
    status: 'ready',
    items: TITLES.map((title, index) =>
      makeItem({
        category: 'waiting',
        reason: 'Waiting on reviewers',
        pr: makePullRequest({
          id: `PR_${index}`,
          number: 3512 - index,
          title,
          authorAvatarUrl: AVATAR_SRC,
          updatedAt: new Date(now - (index + 1) * HOUR_MS).toISOString(),
        }),
      }),
    ),
    attentionCount: 0,
    lastUpdatedAt: new Date(now - 12_000).toISOString(),
    errorMessage: null,
    myLogin: 'vlad',
    knownRepositories: ['acme/web'],
  }
}

function shellCase(name: string, openWaiting: boolean): void {
  for (const mode of COLOR_MODES) {
    test(`${name} (${mode})`, async () => {
      // Written onto `<html>` as well as passed to the provider, for the
      // reason spelled out in test/visual.tsx.
      document.documentElement.setAttribute('data-rs-color-mode', mode)
      stubApi(inboxZero(Date.now()), 'comfortable')

      const screen = await render(
        <Reshaped theme="slate" defaultColorMode={mode}>
          <div
            data-testid="shell"
            style={{ width: `${SHELL_WIDTH_PX}px`, height: `${SHELL_HEIGHT_PX}px` }}
          >
            <App />
          </div>
        </Reshaped>,
      )

      // The snapshot and the settings both arrive a microtask after mount, and
      // until they do `App` holds a spinner.
      const heading = screen.getByText('Waiting on others')
      await expect.element(heading).toBeVisible()
      if (openWaiting) {
        // Dispatched rather than clicked with the mouse: a real click leaves
        // the pointer sitting where the rows it just revealed now are, and
        // the cursor follows the pointer onto one of them — so the capture
        // would come out with a tinted row and its actions showing.
        const button = heading.element().closest('button')
        if (button === null) throw new Error('the section heading is not a button')
        button.click()
      }

      await expect.element(screen.getByTestId('shell')).toMatchScreenshot(`${name}-${mode}`)
    })
  }
}

shellCase('inbox-zero-pinned', false)
shellCase('inbox-zero-opened', true)

for (const mode of COLOR_MODES) {
  test(`GitLab shows the connected account when no MRs are returned (${mode})`, async () => {
    document.documentElement.setAttribute('data-rs-color-mode', mode)
    stubApi(
      {
        ...inboxZero(Date.now()),
        items: [],
        myLogin: 'devuser',
        knownRepositories: [],
      },
      'comfortable',
      { provider: 'gitlab', gitlabUrl: 'https://gitlab.example.com' },
    )

    const screen = await render(
      <Reshaped theme="slate" defaultColorMode={mode}>
        <div
          data-testid="shell"
          style={{ width: `${SHELL_WIDTH_PX}px`, height: `${SHELL_HEIGHT_PX}px` }}
        >
          <App />
        </div>
      </Reshaped>,
    )

    await expect.element(screen.getByText('Connected as @devuser.', { exact: false })).toBeVisible()
    await expect.element(screen.getByTestId('shell')).toMatchScreenshot(`gitlab-no-mrs-${mode}`)
  })

  test(`GitLab inbox groups review requests, authored MRs and mentions (${mode})`, async () => {
    document.documentElement.setAttribute('data-rs-color-mode', mode)
    const now = Date.now()
    const mr = (id: number, repository: string, title: string) =>
      makePullRequest({
        id: `GL_${id}`,
        provider: 'gitlab',
        number: id,
        repository,
        title,
        url: `https://gitlab.example.com/${repository}/-/merge_requests/${id}`,
        authorAvatarUrl: AVATAR_SRC,
        updatedAt: new Date(now - HOUR_MS).toISOString(),
      })
    const snapshot: InboxSnapshot = {
      ...inboxZero(now),
      items: [
        makeItem({
          pr: mr(42, 'acme/web', 'Add keyboard navigation'),
          category: 'needs-review',
          reason: 'Review requested',
          waitingSince: new Date(now - 3 * HOUR_MS).toISOString(),
        }),
        makeItem({
          pr: mr(17, 'acme/api', 'Handle expired sessions'),
          category: 'needs-review',
          reason: 'Review requested',
          waitingSince: new Date(now - 2 * HOUR_MS).toISOString(),
        }),
        makeItem({
          pr: { ...mr(108, 'acme/web', 'Ship the new dashboard'), authorLogin: 'devuser' },
          category: 'my-pr-action',
          reason: 'Merge conflicts',
          waitingSince: new Date(now - HOUR_MS).toISOString(),
        }),
        makeItem({
          pr: mr(73, 'acme/mobile', 'Improve offline sync'),
          category: 'mentioned',
          reason: 'Mentioned in a comment',
          waitingSince: new Date(now - 20 * 60_000).toISOString(),
        }),
      ],
      attentionCount: 4,
      myLogin: 'devuser',
      knownRepositories: ['acme/web', 'acme/api', 'acme/mobile'],
    }
    stubApi(snapshot, 'comfortable', {
      provider: 'gitlab',
      gitlabUrl: 'https://gitlab.example.com',
    })

    const screen = await render(
      <Reshaped theme="slate" defaultColorMode={mode}>
        <div
          data-testid="shell"
          style={{ width: `${SHELL_WIDTH_PX}px`, height: `${SHELL_HEIGHT_PX}px` }}
        >
          <App />
        </div>
      </Reshaped>,
    )

    await expect.element(screen.getByText('Add keyboard navigation')).toBeVisible()
    await expect.element(screen.getByText('Your MRs')).toBeVisible()
    await expect.element(screen.getByText('Ship the new dashboard')).toBeVisible()
    await expect.element(screen.getByTestId('shell')).toMatchScreenshot(`gitlab-inbox-${mode}`)
  })
}

test('a repository filter hiding GitLab MRs does not suggest reconnecting the token', async () => {
  document.documentElement.setAttribute('data-rs-color-mode', 'light')
  stubApi(
    {
      ...inboxZero(Date.now()),
      items: [],
      myLogin: 'devuser',
      knownRepositories: ['acme/web'],
    },
    'comfortable',
    { provider: 'gitlab', gitlabUrl: 'https://gitlab.example.com' },
  )
  const screen = await render(
    <Reshaped theme="slate" defaultColorMode="light">
      <div style={{ width: `${SHELL_WIDTH_PX}px`, height: `${SHELL_HEIGHT_PX}px` }}>
        <App />
      </div>
    </Reshaped>,
  )

  await expect.element(screen.getByText('Inbox zero')).toBeVisible()
  await expect.element(screen.getByText('No MRs found')).not.toBeInTheDocument()
})

test('starts the new account at its first card and the top of the list', async () => {
  document.documentElement.setAttribute('data-rs-color-mode', 'light')
  const now = Date.now()
  const inbox = (prefix: string, title: string): InboxSnapshot => ({
    ...inboxZero(now),
    items: Array.from({ length: 24 }, (_, index) =>
      makeItem({
        pr: makePullRequest({
          id: `${prefix}_${index}`,
          number: index + 1,
          title: `${title} ${index}`,
          authorAvatarUrl: AVATAR_SRC,
        }),
      }),
    ),
    attentionCount: 24,
  })

  let pushSnapshot: (snapshot: InboxSnapshot) => void = () => {}
  let pushSettings: (settings: Settings) => void = () => {}
  const githubSettings = { ...DEFAULT_SETTINGS, provider: 'github' as const }
  window.api = {
    getSnapshot: () => Promise.resolve(inbox('GH', 'GitHub change')),
    onSnapshot: (listener: typeof pushSnapshot) => {
      pushSnapshot = listener
      return () => {}
    },
    getSettings: () => Promise.resolve(githubSettings),
    onSettings: (listener: typeof pushSettings) => {
      pushSettings = listener
      return () => {}
    },
    getUpdate: () => Promise.resolve({ status: 'idle', version: null }),
    onUpdate: () => () => {},
  } as unknown as typeof window.api

  const screen = await render(
    <Reshaped theme="slate" defaultColorMode="light">
      <div style={{ width: `${SHELL_WIDTH_PX}px`, height: `${SHELL_HEIGHT_PX}px` }}>
        <App />
      </div>
    </Reshaped>,
  )
  await expect.element(screen.getByText('GitHub change 0')).toBeVisible()

  const press = (key: string): void => {
    ;(document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    )
  }
  for (let step = 1; step <= 8; step++) {
    press('ArrowDown')
    await expect
      .poll(() => document.activeElement?.textContent ?? '')
      .toContain(`GitHub change ${step}`)
  }
  // Whichever ancestor of the cursor's card actually scrolls — Reshaped's
  // `ScrollArea` wraps it in more than one element.
  const scroller = (): HTMLElement => {
    let node = document.activeElement?.parentElement ?? null
    while (node !== null && node.scrollHeight <= node.clientHeight) node = node.parentElement
    if (node === null) throw new Error('nothing around the cursor scrolls')
    return node
  }
  scroller().scrollTop = 400
  scroller().dispatchEvent(new Event('scroll'))
  expect(scroller().scrollTop).toBeGreaterThan(0)

  // The order main sends them in: `Inbox.reset` first, then the settings push.
  pushSnapshot({ ...inbox('GL', 'GitLab change'), status: 'loading', items: [] })
  pushSettings({ ...githubSettings, provider: 'gitlab' })
  await expect.poll(() => document.body.textContent).not.toContain('GitHub change 0')
  pushSnapshot(inbox('GL', 'GitLab change'))

  await expect.element(screen.getByText('GitLab change 0')).toBeVisible()
  await expect.poll(() => document.activeElement?.textContent ?? '').toContain('GitLab change 0')
  expect(scroller().scrollTop).toBe(0)

  for (let step = 1; step <= 8; step++) {
    press('ArrowDown')
    await expect
      .poll(() => document.activeElement?.textContent ?? '')
      .toContain(`GitLab change ${step}`)
  }
  scroller().scrollTop = 400
  scroller().dispatchEvent(new Event('scroll'))

  pushSnapshot({
    ...inbox('GL2', 'Next GitLab change'),
    accountVersion: 2,
    status: 'loading',
    items: [],
  })
  pushSnapshot({ ...inbox('GL2', 'Next GitLab change'), accountVersion: 2 })
  await expect.element(screen.getByText('Next GitLab change 0')).toBeVisible()
  await expect
    .poll(() => document.activeElement?.textContent ?? '')
    .toContain('Next GitLab change 0')
  expect(scroller().scrollTop).toBe(0)
})
