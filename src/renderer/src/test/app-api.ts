import type { InboxSnapshot } from '@shared/ipc'
import { DEFAULT_SETTINGS, type Layout } from '@shared/types'

/**
 * `App` pulls three things off the IPC bridge on mount and subscribes to each
 * of them. Nothing else is reachable without a click, so the rest of the
 * bridge stays absent — a case that does click will find out which piece it
 * needs by the `undefined` it gets.
 */
export function stubApi(snapshot: InboxSnapshot, layout: Layout): void {
  window.api = {
    getSnapshot: () => Promise.resolve(snapshot),
    onSnapshot: () => () => {},
    getSettings: () => Promise.resolve({ ...DEFAULT_SETTINGS, layout }),
    onSettings: () => () => {},
    getUpdate: () => Promise.resolve({ status: 'idle', version: null }),
    onUpdate: () => () => {},
  } as unknown as typeof window.api
}
