// Writes each changeset summary as a plain bullet, without the commit hash the
// default generator prepends: the summary is the release note line as is.
export default {
  getReleaseLine: (changeset) => {
    const [firstLine, ...rest] = changeset.summary.trim().split('\n')
    return [`- ${firstLine}`, ...rest.map((line) => (line ? `  ${line}` : line))].join('\n')
  },
  getDependencyReleaseLine: () => '',
}
