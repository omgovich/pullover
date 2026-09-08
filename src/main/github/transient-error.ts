/**
 * Whether asking again could plausibly answer differently.
 *
 * Only a 5xx qualifies: GitHub or its edge failing on its own side, which
 * includes the 502 a terminated query comes back as and the synthetic 500
 * `@octokit/request` files a network failure under. Everything else answers
 * the same way however many times it is asked, and retrying it only spends
 * the user's quota and their patience:
 *
 * - 401 — the token is dead (`isAuthError` hands it to sign-out).
 * - 403, 429 — a rate limit (`rateLimitResetAt` decides how long to wait).
 * - any other 4xx — a malformed or unauthorised request.
 * - `GraphqlResponseError` — carries no `status` at all, because the query
 *   *was* answered; the errors are in the response body.
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error) || !('status' in error)) return false
  const status = (error as { status: unknown }).status
  return typeof status === 'number' && status >= 500
}
