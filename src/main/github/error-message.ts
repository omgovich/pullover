/** Longest message that still reads as a sentence in the header's one line. */
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
 * node_modules/@octokit/request/dist-src/fetch-wrapper.js). GitHub itself
 * answers in JSON, but a proxy between the app and the API doesn't: a
 * corporate gateway having a bad day sends an HTML page, and all of
 * `<html><head><title>502 Bad Gateway</title>…` lands where a sentence
 * belongs. So a message is kept only while it still reads as one, and the
 * HTTP status stands in for it otherwise.
 */
export function describeError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, ' ')
    .trim()

  if (message !== '' && !message.startsWith('<') && message.length <= MAX_LENGTH) return message

  const status = httpStatus(error)
  return status === null ? "Couldn't reach GitHub" : `Couldn't reach GitHub — HTTP ${status}`
}
