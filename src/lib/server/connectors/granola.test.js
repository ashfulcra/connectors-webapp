import { it, expect, vi } from 'vitest';
const mod = await import('./granola.js').catch(() => /** @type {any} */ ({}));
const createGranola =
  mod.createGranola ??
  (() => {
    throw new Error('Granola adapter missing');
  });
const config = { resources: ['fol_selected'], backfillSince: '2026-01-01T00:00:00Z' };
const note = {
  id: 'not_one',
  title: 'Meeting',
  updated_at: '2026-10-22T10:00:00Z',
  created_at: '2026-10-22T09:00:00Z',
  folder_membership: [{ id: 'fol_selected' }],
  summary_markdown: 'Summary',
  transcript: [{ text: 'Hello' }],
  private_notes_text: 'private',
  attachments: [{ url: 'private-url' }]
};
/** @param {any} fetchImpl */
const adapter = (fetchImpl) => createGranola({ fetchImpl });
it('uses selected folder and update overlap; strips private notes and attachments', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ notes: [note], hasMore: false, cursor: null }))
    .mockResolvedValueOnce(Response.json(note));
  const result = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: { since: '2026-10-22T09:00:00Z' },
    deadline: Date.now() + 10000
  });
  const url = new URL(String(fetchImpl.mock.calls[0][0]));
  expect(url.searchParams.get('folder_id')).toBe('fol_selected');
  expect(url.searchParams.get('updated_after')).toBe('2026-10-22T08:58:00.000Z');
  expect(JSON.stringify(result)).not.toContain('private');
  expect(result.changes[0].payload.transcript[0].text).toBe('Hello');
});
it('persists list continuation and rejects a note outside the selected folder', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ notes: [note], hasMore: true, cursor: 'next' }))
    .mockResolvedValueOnce(Response.json({ ...note, folder_membership: [{ id: 'fol_other' }] }));
  const result = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: null,
    deadline: Date.now() + 10000
  });
  expect(result.changes).toEqual([]);
  expect(result.candidateCheckpoint.cursor).toBe('next');
  expect(result.continuation).toBeTruthy();
});
it('large transcripts persist their page frontier rather than truncating', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ notes: [note], hasMore: false, cursor: null }))
    .mockResolvedValueOnce(Response.json({ code: 'TRANSCRIPT_TOO_LARGE' }, { status: 413 }))
    .mockResolvedValueOnce(Response.json({ ...note, transcript: null }))
    .mockResolvedValueOnce(
      Response.json({ transcript: [{ text: 'Part one' }], hasMore: true, cursor: 'part-two' })
    );
  const result = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: null,
    deadline: Date.now() + 10000
  });
  expect(result.candidateCheckpoint.transcript.cursor).toBe('part-two');
  expect(
    result.changes.some((/** @type {any} */ x) => x.payload.transcript?.[0]?.text === 'Part one')
  ).toBe(true);
});
it('retains delayed transcript IDs for later rechecks and reports revoked credentials', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ notes: [note], hasMore: false, cursor: null }))
    .mockResolvedValueOnce(Response.json({ ...note, transcript: null }));
  const result = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: null,
    deadline: Date.now() + 10000
  });
  expect(result.candidateCheckpoint.delayed).toContainEqual({
    id: note.id,
    folder: 'fol_selected'
  });
  await expect(
    adapter(async () => new Response('', { status: 401 })).readPage({
      connection: { config },
      credential: { token: 'revoked' },
      checkpoint: null,
      deadline: Date.now() + 10000
    })
  ).rejects.toThrow(/reauthorize/);
});
it('a delayed transcript recheck cannot advance the listing watermark', async () => {
  const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(note));
  const result = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: { since: '2026-10-22T09:00:00Z', index: 0, delayed: [note.id], recheck: true },
    deadline: Date.now() + 10000
  });
  expect(result.candidateCheckpoint.since).toBe('2026-10-22T09:00:00Z');
});
it('retains a delayed transcript belonging to a different selected folder', async () => {
  const two = { config: { ...config, resources: ['fol_selected', 'fol_other'] } };
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(Response.json({ notes: [], hasMore: false, cursor: null }));
  const result = await adapter(fetchImpl).readPage({
    connection: two,
    credential: { token: 'key' },
    checkpoint: {
      index: 1,
      since: '2026-10-01T00:00:00Z',
      delayed: [{ id: note.id, folder: 'fol_selected' }],
      recheck: true
    },
    deadline: Date.now() + 10000
  });
  expect(result.candidateCheckpoint.delayed).toEqual([{ id: note.id, folder: 'fol_selected' }]);
  expect(String(fetchImpl.mock.calls[0][0])).toContain('folder_id=fol_other');
});
it('clears the final continuation of a paginated delayed transcript', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(
      Response.json({ transcript: [{ text: 'Final chunk' }], hasMore: false, cursor: null })
    );
  const result = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: {
      index: 0,
      since: '2026-10-01T00:00:00Z',
      delayed: [],
      recheck: true,
      transcript: { note, cursor: 'last', rechecking: true }
    },
    deadline: Date.now() + 10000
  });
  expect(result.candidateCheckpoint.transcript).toBeNull();
  expect(result.candidateCheckpoint.recheck).toBe(false);
});
it('keeps paginated meeting artifacts stable while transcript chunks remain distinct', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ notes: [note], hasMore: false }))
    .mockResolvedValueOnce(new Response('', { status: 413 }))
    .mockResolvedValueOnce(Response.json({ ...note, transcript: undefined }))
    .mockResolvedValueOnce(
      Response.json({ transcript: [{ text: 'First chunk' }], hasMore: true, cursor: 'next' })
    )
    .mockResolvedValueOnce(
      Response.json({ transcript: [{ text: 'Second chunk' }], hasMore: false })
    );
  const first = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: null,
    deadline: Date.now() + 10000
  });
  const second = await adapter(fetchImpl).readPage({
    connection: { config },
    credential: { token: 'key' },
    checkpoint: first.candidateCheckpoint,
    deadline: Date.now() + 10000
  });
  const firstMeeting = first.changes.find((/** @type {any} */ x) => x.id === note.id),
    secondMeeting = second.changes.find((/** @type {any} */ x) => x.id === note.id);
  expect(firstMeeting.files[0].content).toBe(secondMeeting.files[0].content);
  expect(firstMeeting.files[0].content).toContain('paginated');
  expect(firstMeeting.files[0].content).not.toContain('First chunk');
});
