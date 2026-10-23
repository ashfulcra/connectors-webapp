import { it, expect, vi } from 'vitest';
import { createAsana } from './asana.js';
const connection = { config: { resources: ['123'], backfillSince: '2026-01-01T00:00:00Z' } };
/** @param {any} fetchImpl @param {any} checkpoint */
const read = (fetchImpl, checkpoint = null) =>
  createAsana({ fetchImpl }).readPage({
    connection,
    credential: { token: 'test' },
    checkpoint,
    deadline: Date.now() + 10000
  });
it('establishes the event token before paginated project enumeration', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ sync: 'before-scan' }, { status: 412 }))
    .mockResolvedValueOnce(
      Response.json({
        data: [{ gid: 'task', name: 'Example', modified_at: '2026-10-01T00:00:00Z' }],
        next_page: { offset: 'more' }
      })
    );
  const page = await read(fetchImpl);
  expect(String(fetchImpl.mock.calls[0][0])).toContain('/events?');
  expect(page.candidateCheckpoint.projects['123'].sync).toBe('before-scan');
  expect(page.candidateCheckpoint.projects['123'].offset).toBe('more');
});
it('an expired 412 cursor requires reconciliation instead of accepting the gap', async () => {
  const page = await read(async () => Response.json({ sync: 'replacement' }, { status: 412 }), {
    index: 0,
    projects: { 123: { phase: 'events', sync: 'expired', reconciledAt: new Date().toISOString() } }
  });
  expect(page.resetRequired).toBe(true);
});
it('distinguishes removals and deletions and hydrates changed tasks within the selected project', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        sync: 'next',
        data: [
          {
            resource: { gid: 'a', resource_type: 'task' },
            action: 'removed',
            created_at: '2026-10-01T00:00:00Z'
          },
          {
            resource: { gid: 'b', resource_type: 'task' },
            action: 'deleted',
            created_at: '2026-10-01T00:00:00Z'
          },
          {
            resource: { gid: 'c', resource_type: 'task' },
            action: 'changed',
            created_at: '2026-10-01T00:00:00Z'
          }
        ]
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        data: {
          gid: 'c',
          name: 'Updated',
          modified_at: '2026-10-01T00:00:00Z',
          memberships: [{ project: { gid: '123' } }]
        }
      })
    );
  const page = await read(fetchImpl, {
    index: 0,
    projects: { 123: { phase: 'events', sync: 'valid', reconciledAt: new Date().toISOString() } }
  });
  expect(page.changes.map((/** @type {any} */ x) => x.operation)).toEqual([
    'removed',
    'deleted',
    'upsert'
  ]);
  expect(page.changes[2].payload.name).toBe('Updated');
});
