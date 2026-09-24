enum Queries {
    static let viewer = """
    query Viewer {
      viewer { login }
    }
    """

    static let search = """
    query SearchPullRequests($q: String!) {
      rateLimit { cost remaining resetAt }
      search(query: $q, type: ISSUE, first: 50) {
        nodes {
          ... on PullRequest { id }
        }
      }
    }
    """

    static let details = """
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
          isCrossRepository
          reviewDecision
          mergeable
          autoMergeRequest { enabledAt }
          bodyText
          author { login avatarUrl }
          repository { nameWithOwner }
          reviews(last: 50) {
            nodes { author { login } state submittedAt bodyText commit { oid } }
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
                oid
                committedDate
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
    """
}
