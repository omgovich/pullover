/** Longest message kept whole; past this it is cut with an ellipsis. */
const MAX_LENGTH = 120

function httpStatus(error: unknown): number | null {
  if (!(error instanceof Error) || !('status' in error)) return null
  const status = (error as { status: unknown }).status
  return typeof status === 'number' ? status : null
}

/**
 * Turns whatever a failed refresh threw into one line fit for the header.
 *
 * `@octokit/request` builds a `RequestError` whose message is the response
 * body verbatim whenever that body isn't JSON (see `toErrorMessage` in
 * node_modules/@octokit/request/dist-src/fetch-wrapper.js). GitHub answers
 * in JSON, but the edge in front of it doesn't always: a gateway that gave
 * up sends an HTML page, and all of
 * `<html><head><title>502 Bad Gateway</title>…` lands where a sentence
 * belongs. A body that opens like a document rather than a sentence is
 * therefore dropped for the status it arrived under; a genuine sentence is
 * kept even when it is long, because its first clause is the part that
 * fits on screen and it says more than any status could.
 */
export function describeError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, ' ')
    .trim()

  if (/^[<{[]/.test(message) || message === '') {
    const status = httpStatus(error)
    return status === null ? "Couldn't reach GitHub" : `Couldn't reach GitHub — HTTP ${status}`
  }

  if (message.length <= MAX_LENGTH) return message
  // Cut at the last word boundary, so the ellipsis follows a whole word.
  const cut = message.slice(0, MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace === -1 ? cut : cut.slice(0, lastSpace)}…`
}
