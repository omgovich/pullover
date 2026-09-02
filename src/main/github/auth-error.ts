/**
 * Recognises a dead GitHub token — revoked or expired — from what
 * `@octokit/graphql` throws.
 *
 * A bad credential makes the underlying HTTP request come back 401.
 * `@octokit/request`'s fetch wrapper turns any non-2xx response into
 * `@octokit/request-error`'s `RequestError` (see
 * node_modules/@octokit/request-error/dist-src/index.js): a plain `Error`
 * subclass with `name: "HttpError"` and a numeric `status` set to the HTTP
 * status code. That `status` field is what this predicate checks.
 *
 * A GraphQL query that is merely malformed, or asks for something that
 * doesn't exist, still gets a 200 response with an `errors` array inside
 * it — `@octokit/graphql` throws `GraphqlResponseError` for that case (see
 * node_modules/@octokit/graphql/dist-src/error.js), which carries no
 * `status` at all, so it never matches here. Neither does a `RequestError`
 * for a different status (rate limiting, a 5xx, or the 500 the fetch
 * wrapper synthesises for a network failure) — only 401 means the token
 * itself is no good.
 */
export function isAuthError(error: unknown): boolean {
  return (
    error instanceof Error && 'status' in error && (error as { status: unknown }).status === 401
  )
}
