import { it, expect, vi } from 'vitest';
import { createSlack } from './slack.js';
const connection = { config: { resources: ['CSELECTED'], backfillSince: '2026-01-01T00:00:00Z' } };
/** @param {any} fetchImpl @param {any} checkpoint @param {any[]} hints */
const read = (fetchImpl, checkpoint = null, hints = []) =>
  createSlack({ fetchImpl }).readPage({
    connection,
    credential: { token: 'test' },
    checkpoint,
    hints,
    deadline: Date.now() + 10000
  });
it('preserves original timestamp strings and both history/thread cursor frontiers', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        ok: true,
        messages: [{ ts: '1790000000.123456', text: 'Message', reply_count: 2 }],
        has_more: true,
        response_metadata: { next_cursor: 'history-next' }
      })
    );
  const page = await read(fetchImpl);
  expect(page.changes[0].payload.ts).toBe('1790000000.123456');
  expect(page.candidateCheckpoint.channels.CSELECTED.historyCursor).toBe('history-next');
  expect(page.candidateCheckpoint.channels.CSELECTED.threads[0].ts).toBe('1790000000.123456');
});
it('hydrates thread pages with independent cursor pagination', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        ok: true,
        messages: [{ ts: '1790000000.123457', thread_ts: '1790000000.123456', text: 'Reply' }],
        response_metadata: { next_cursor: 'thread-next' }
      })
    );
  const page = await read(fetchImpl, {
    index: 0,
    channels: {
      CSELECTED: {
        phase: 'threads',
        threads: [{ ts: '1790000000.123456', cursor: null }],
        since: '1790000000.123456',
        high: '1790000000.123456'
      }
    }
  });
  expect(String(fetchImpl.mock.calls[0][0])).toContain('conversations.replies?');
  expect(page.candidateCheckpoint.channels.CSELECTED.threads[0].cursor).toBe('thread-next');
});
it('old edit hints hydrate the exact message and ignore unselected channel hints', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        ok: true,
        messages: [{ ts: '1000.123456', text: 'Edited', edited: { ts: '1790000000.000001' } }]
      })
    );
  const page = await read(fetchImpl, null, [
    {
      event_id: 'selected',
      payload: {
        event: { channel: 'CSELECTED', subtype: 'message_changed', message: { ts: '1000.123456' } }
      }
    },
    {
      event_id: 'other',
      payload: { event: { channel: 'COTHER', subtype: 'message_deleted', deleted_ts: '1.0' } }
    }
  ]);
  expect(page.changes).toHaveLength(1);
  expect(page.changes[0].payload.text).toBe('Edited');
  expect(String(fetchImpl.mock.calls[0][0])).toContain('oldest=1000.123456');
  expect(page.ackHintIds).toContain('selected');
});
it('honors 429 Retry-After without advancing the cursor', async () => {
  const page = await read(
    async () => new Response('{}', { status: 429, headers: { 'Retry-After': '120' } })
  );
  expect(page.candidateCheckpoint).toBeUndefined();
  expect(Date.parse(page.retryAt)).toBeGreaterThan(Date.now() + 110000);
});
it('an old-root reply hint persists a separate thread frontier without changing history watermark', async () => {
  const first = await read(
    vi.fn(),
    {
      index: 0,
      channels: { CSELECTED: { phase: 'history', since: '1790000000.000001', threads: [] } }
    },
    [
      {
        event_id: 'thread-event',
        payload: {
          event: { channel: 'CSELECTED', ts: '1790000000.000002', thread_ts: '1000.123456' }
        }
      }
    ]
  );
  expect(first.candidateCheckpoint.hintThreads[0].ts).toBe('1000.123456');
  expect(first.candidateCheckpoint.channels.CSELECTED.since).toBe('1790000000.000001');
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        ok: true,
        messages: [
          { ts: '1790000000.000002', thread_ts: '1000.123456', text: 'New old-thread reply' }
        ],
        response_metadata: { next_cursor: '' }
      })
    );
  const second = await read(fetchImpl, first.candidateCheckpoint);
  expect(String(fetchImpl.mock.calls[0][0])).toContain('conversations.replies?');
  expect(second.changes[0].payload.text).toBe('New old-thread reply');
});
