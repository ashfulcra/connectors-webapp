import { it, expect, vi } from 'vitest';
import { createGitHub } from './github.js';
const connection = {
  config: { resources: ['example/repo'], backfillSince: '2026-01-01T00:00:00Z' }
};
/** @param {any} fetchImpl @param {any} checkpoint */
const read = (fetchImpl, checkpoint = null) =>
  createGitHub({ fetchImpl }).readPage({
    connection,
    credential: { token: 'test' },
    checkpoint,
    deadline: Date.now() + 10000
  });
it('normalizes issues versus PRs and follows Link pagination only in the selected repo', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    Response.json(
      [
        { id: 1, number: 1, title: 'Issue', updated_at: '2026-10-01T00:00:00Z' },
        {
          id: 2,
          number: 2,
          title: 'PR',
          pull_request: { url: 'https://api.github.com/repos/example/repo/pulls/2' },
          updated_at: '2026-10-01T00:00:00Z'
        }
      ],
      { headers: { Link: '<https://api.github.com/repos/example/repo/issues?page=2>; rel="next"' } }
    )
  );
  const page = await read(fetchImpl);
  expect(page.changes.map((/** @type {any} */ x) => x.payload.kind)).toEqual([
    'issue',
    'pull_request'
  ]);
  expect(page.candidateCheckpoint.next).toContain('page=2');
  const init = fetchImpl.mock.calls[0][1];
  expect(init.headers['X-GitHub-Api-Version']).toBe('2026-03-10');
  await expect(
    read(async () =>
      Response.json([], {
        headers: { Link: '<https://api.github.com/repos/other/repo/issues?page=2>; rel="next"' }
      })
    )
  ).rejects.toThrow(/pagination/);
});
it('polls changed comments independently with an overlapping update watermark', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      Response.json([
        {
          id: 3,
          body: 'Edited',
          updated_at: '2026-10-01T00:00:00Z',
          issue_url: 'https://api.github.com/repos/example/repo/issues/1'
        }
      ])
    );
  const page = await read(fetchImpl, {
    index: 0,
    phase: 'comments',
    since: '2026-10-01T00:00:00Z'
  });
  expect(String(fetchImpl.mock.calls[0][0])).toContain('/issues/comments?');
  expect(page.changes[0].payload.kind).toBe('comment');
  expect(String(fetchImpl.mock.calls[0][0])).toContain('2026-09-30T23%3A58');
});
it('honors secondary rate limits rather than retrying immediately', async () => {
  const page = await read(
    async () => new Response('{}', { status: 403, headers: { 'Retry-After': '120' } })
  );
  expect(Date.parse(page.retryAt)).toBeGreaterThan(Date.now() + 110000);
});
