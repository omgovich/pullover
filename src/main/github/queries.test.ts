import { describe, expect, it } from 'vitest'
import { DETAILS_QUERY } from './queries'

describe('DETAILS_QUERY', () => {
  it('fetches review bodies, needed to scan reviews for mentions', () => {
    // Without this, a mention submitted as a review body (e.g. "@vlad take
    // another look") is invisible to the mention scan.
    expect(DETAILS_QUERY).toContain('state submittedAt bodyText')
  })

  it('fetches mergeability, which decides the merge-conflict reason', () => {
    expect(DETAILS_QUERY).toContain('mergeable')
  })

  it('fetches the branch names a stack position is derived from', () => {
    expect(DETAILS_QUERY).toContain('headRefName')
    expect(DETAILS_QUERY).toContain('baseRefName')
  })

  it('paginates review threads from the newest end', () => {
    // `first: 50` takes the OLDEST 50 threads on a busy PR, dropping exactly
    // the newest thread — where a fresh mention is most likely to live.
    expect(DETAILS_QUERY).toContain('reviewThreads(last: 50)')
    expect(DETAILS_QUERY).not.toContain('reviewThreads(first:')
  })

  it('paginates comments inside a review thread from the newest end', () => {
    const threadBlockStart = DETAILS_QUERY.indexOf('reviewThreads(last: 50)')
    const threadBlockEnd = DETAILS_QUERY.indexOf('commits(last:')
    const threadBlock = DETAILS_QUERY.slice(threadBlockStart, threadBlockEnd)
    expect(threadBlock).toContain('comments(last: 50)')
    expect(threadBlock).not.toContain('comments(first:')
  })

  it('still paginates the PR-level conversation comments from the newest end', () => {
    // Once nested inside reviewThreads, once at the PR level.
    const occurrences = DETAILS_QUERY.split('comments(last: 50)').length - 1
    expect(occurrences).toBe(2)
  })
})
