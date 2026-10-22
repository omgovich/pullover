export const VIEWER_QUERY = `
  query Viewer {
    viewer { login }
  }
`

export const SEARCH_QUERY = `
  query SearchPullRequests($q: String!, $after: String) {
    rateLimit { cost remaining resetAt }
    search(query: $q, type: ISSUE, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest { id }
      }
    }
  }
`

export const DETAILS_QUERY = `
  query PullRequestDetails($ids: [ID!]!) {
    rateLimit { cost remaining resetAt }
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
        headRefName
        baseRefName
        stackEntry {
          position
          stack { id size }
        }
        reviewDecision
        mergeable
        autoMergeRequest { enabledAt }
        isInMergeQueue
        bodyText
        author { login avatarUrl }
        repository { nameWithOwner }
        reviews(last: 50) {
          nodes { author { __typename login } state submittedAt bodyText }
        }
        reviewThreads(last: 50) {
          nodes {
            id
            isResolved
            comments(last: 50) {
              nodes { author { __typename login } createdAt bodyText }
            }
          }
        }
        comments(last: 50) {
          nodes { author { __typename login } createdAt bodyText }
        }
        commits(last: 1) {
          nodes {
            commit {
              committedDate
              checkSuites(first: 10) { nodes { createdAt push { id } } }
              statusCheckRollup { state }
            }
          }
        }
        timelineItems(last: 50, itemTypes: [REVIEW_REQUESTED_EVENT, READY_FOR_REVIEW_EVENT]) {
          nodes {
            __typename
            ... on ReviewRequestedEvent {
              createdAt
              requestedReviewer { ... on User { login } }
            }
            ... on ReadyForReviewEvent {
              createdAt
            }
          }
        }
      }
    }
  }
`
