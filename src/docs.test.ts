import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Settings panel and the documentation point at files and ports that live
 * elsewhere in the repository. Nothing else notices when one of them moves:
 * a renamed doc leaves a link that only fails in a browser, and a changed
 * port leaves instructions that only fail on somebody else's machine.
 */

const root = resolve(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8')

describe('the Setup instructions link', () => {
  it('points at a file that is actually in the repository', () => {
    const source = read('src/renderer/src/components/McpSection.tsx')
    const match = source.match(/blob\/main\/([\w./-]+)'/)
    expect(match, 'no repository link found in McpSection').not.toBeNull()
    // Throws if the file is gone, which is the whole point.
    expect(read(match?.[1] ?? '').length).toBeGreaterThan(0)
  })
})

describe('the documented ports', () => {
  // Anchored to the two shapes a port is deliberately written in — inside an
  // address, or in backticks — so an issue number in prose is not mistaken
  // for one.
  const ports = (text: string): string[] =>
    [...new Set((text.match(/(?:127\.0\.0\.1:|`)(78\d\d)/g) ?? []).map((m) => m.slice(-4)))].sort()

  it('are the two the app actually binds', () => {
    const wiring = read('src/main/index.ts')
    const bound = [...new Set(wiring.match(/\b78\d\d\b/g) ?? [])].sort()
    expect(bound).toEqual(['7855', '7856'])
  })

  // MCP.md and the README are read by people running the released app, so the
  // dev port would only be something to rule out. AGENTS.md is read from a
  // source build, where it is the only port that works.
  it('are the packaged one in the docs written for released users', () => {
    expect(ports(read('MCP.md'))).toEqual(['7855'])
    expect(ports(read('README.md'))).toEqual(['7855'])
  })

  it('are both in the agent guide, which is read from a source build', () => {
    expect(ports(read('AGENTS.md'))).toEqual(['7855', '7856'])
  })
})
