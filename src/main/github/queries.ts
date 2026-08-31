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
        bodyText
        author { login avatarUrl }
        repository { nameWithOwner }
        reviews(first: 50) {
          nodes { author { login } state submittedAt bodyText }
        }
        reviewThreads(last: 50) {
          nodes {
            id
            isResolved
            comments(last: 50) {
              nodes { author { login } createdAt bodyText }
            }
          }
        }
        comments(last: 50) {
          nodes { author { login } createdAt bodyText }
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
