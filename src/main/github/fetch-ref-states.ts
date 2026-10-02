import { refKey } from '@core/pr-refs'
import type { PullRequestRef, PullRequestState } from '@shared/types'
import type { GraphQLClient } from './fetch-prs'
import { graphqlPartialData } from './org-restriction'

interface RefNode {
  issueOrPullRequest: { __typename: string; state?: PullRequestState } | null
}

/** One aliased lookup per reference, through variables so no name is spliced into the query. */
export function buildRefStatesQuery(refs: PullRequestRef[]): {
  query: string
  variables: Record<string, string | number>
} {
  const variables: Record<string, string | number> = {}
  const declarations: string[] = []
  const fields: string[] = []
  refs.forEach((ref, i) => {
    const [owner = '', name = ''] = ref.repository.split('/')
    variables[`o${i}`] = owner
    variables[`n${i}`] = name
    variables[`k${i}`] = ref.number
    declarations.push(`$o${i}: String!, $n${i}: String!, $k${i}: Int!`)
    fields.push(
      `r${i}: repository(owner: $o${i}, name: $n${i}) { issueOrPullRequest(number: $k${i}) { __typename ... on PullRequest { state } } }`,
    )
  })
  return {
    query: `query ReferencedPullRequests(${declarations.join(', ')}) {\n  rateLimit { cost remaining resetAt }\n  ${fields.join('\n  ')}\n}`,
    variables,
  }
}

/**
 * The state of each reference that turned out to be a pull request, by
 * `refKey`. Never throws: a missing answer only leaves that reference
 * unknown, which no caller treats as worse than a stale inbox.
 */
export async function fetchRefStates(
  client: GraphQLClient,
  refs: PullRequestRef[],
): Promise<Map<string, PullRequestState>> {
  const states = new Map<string, PullRequestState>()
  if (refs.length === 0) return states

  const { query, variables } = buildRefStatesQuery(refs)
  let data: unknown
  try {
    data = await client(query, variables)
  } catch (error) {
    // A repository that is gone or out of reach fails only its own alias,
    // and GitHub still answers the rest alongside the error.
    data = graphqlPartialData(error)
    if (data === null || data === undefined) {
      console.warn('[github] could not look up referenced pull requests', error)
      return states
    }
  }

  // Outside `fetchPullRequests`' meter, so it reports its own share.
  const { rateLimit } = data as { rateLimit?: { cost: number; remaining: number; resetAt: string } }
  if (rateLimit !== undefined) {
    console.info(
      `[github] reference lookups cost ${rateLimit.cost} points, ${rateLimit.remaining} left until ${rateLimit.resetAt}`,
    )
  }

  const answers = data as Record<string, RefNode | null>
  refs.forEach((ref, i) => {
    const node = answers[`r${i}`]?.issueOrPullRequest
    if (node?.__typename === 'PullRequest' && node.state !== undefined) {
      states.set(refKey(ref), node.state)
    }
  })
  return states
}
