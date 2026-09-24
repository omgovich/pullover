import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitLabClient } from './client'
import { fetchGitLabMergeRequests, fetchGitLabViewer } from './fetch-mrs'

const viewer = { id: 1, username: 'anton' }
const other = { id: 2, username: 'alice' }
const at = '2026-09-01T10:00:00Z'

describe('GitLab HTTP integration', () => {
  const servers: ReturnType<typeof createServer>[] = []

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
  })

  it('loads reviews, authored MRs and mentions through a self-hosted API', async () => {
    const requests: string[] = []
    const mr = (id: number, author = other) => ({
      id,
      iid: id,
      project_id: 7,
      title: `Change ${id}`,
      web_url: `http://localhost/team/app/-/merge_requests/${id}`,
      author,
      created_at: at,
      updated_at: at,
      source_branch: `feature-${id}`,
      target_branch: 'main',
    })
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      requests.push(`${request.method} ${url.pathname}${url.search}`)
      if (request.method !== 'GET' || request.headers['private-token'] !== 'test-token') {
        response.writeHead(401).end()
        return
      }

      let payload: unknown
      if (url.pathname === '/api/v4/user') payload = viewer
      else if (url.pathname === '/api/v4/merge_requests') {
        payload =
          url.searchParams.get('reviewer_id') === String(viewer.id) ? [mr(10)] : [mr(11, viewer)]
      } else if (url.pathname === '/api/v4/todos') {
        payload = [
          {
            action_name: 'mentioned',
            created_at: at,
            target: { id: 12, iid: 12, project_id: 7, state: 'opened' },
          },
        ]
      } else {
        const match = url.pathname.match(
          /^\/api\/v4\/projects\/7\/merge_requests\/(\d+)(?:\/(.*))?$/,
        )
        const id = Number(match?.[1])
        const resource = match?.[2]
        if (![10, 11, 12].includes(id)) {
          response.writeHead(404).end()
          return
        }
        if (!resource) payload = mr(id, id === 11 ? viewer : other)
        else if (resource === 'discussions') payload = []
        else if (resource === 'reviewers') {
          payload = id === 10 ? [{ user: viewer, state: 'unreviewed', created_at: at }] : []
        } else if (resource === 'approvals') payload = { approved: false, approved_by: [] }
        else {
          response.writeHead(404).end()
          return
        }
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'X-Next-Page': '' })
      response.end(JSON.stringify(payload))
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('No server port')

    const client = createGitLabClient(`http://localhost:${address.port}`, 'test-token')
    const user = await fetchGitLabViewer(client)
    const items = await fetchGitLabMergeRequests(client, user)

    expect(items.map((item) => item.attentionOverride?.category)).toEqual([
      'needs-review',
      'waiting',
      'mentioned',
    ])
    expect(items.map((item) => item.number)).toEqual([10, 11, 12])
    expect(requests).toContain(
      'GET /api/v4/merge_requests?scope=all&reviewer_id=1&state=opened&per_page=100&page=1',
    )
    expect(
      requests.filter((request) => request === 'GET /api/v4/projects/7/merge_requests/12'),
    ).toHaveLength(1)
    expect(requests).toContain(
      'GET /api/v4/todos?state=pending&type=MergeRequest&per_page=100&page=1',
    )
  })
})
