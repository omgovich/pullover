import { repositoryName } from '@core/format'
import type { PullRequestRef } from '@shared/types'

// The lookarounds keep a reference from starting or ending mid-word or
// mid-path, so `github.com/acme/api#readme` and `step1#2` name nothing.
const REFERENCE =
  /(?<![\w/.-])https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?!\w)|(?<![\w/.-])(?:([\w.-]+)\/([\w.-]+))?#(\d+)(?!\w)/gi

/** GraphQL's `Int`: one number past it fails the whole lookup, not just its own alias. */
const MAX_NUMBER = 2_147_483_647

export function refKey(ref: PullRequestRef): string {
  return `${ref.repository.toLowerCase()}#${ref.number}`
}

/** The pull requests `body` names, first spelling first, never `self`. */
export function parseReferences(body: string, self: PullRequestRef): PullRequestRef[] {
  const seen = new Set([refKey(self)])
  const refs: PullRequestRef[] = []
  for (const match of body.matchAll(REFERENCE)) {
    const [, urlOwner, urlName, urlNumber, owner, name, number] = match
    const ref =
      urlNumber !== undefined
        ? { repository: `${urlOwner}/${urlName}`, number: Number(urlNumber) }
        : {
            repository: owner === undefined ? self.repository : `${owner}/${name}`,
            number: Number(number),
          }
    if (ref.number < 1 || ref.number > MAX_NUMBER) continue
    const key = refKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    refs.push(ref)
  }
  return refs
}

/** The part of `formatRef` before the `#`: empty on the `from` repository itself. */
export function refRepositoryLabel(ref: PullRequestRef, from: string): string {
  const repository = ref.repository.toLowerCase()
  const fromRepository = from.toLowerCase()
  if (repository === fromRepository) return ''
  const ownerOf = (fullName: string) => fullName.slice(0, fullName.indexOf('/'))
  return ownerOf(repository) === ownerOf(fromRepository)
    ? repositoryName(ref.repository)
    : ref.repository
}

/** How GitHub would write `ref` on a page of the `from` repository. */
export function formatRef(ref: PullRequestRef, from: string): string {
  return `${refRepositoryLabel(ref, from)}#${ref.number}`
}
