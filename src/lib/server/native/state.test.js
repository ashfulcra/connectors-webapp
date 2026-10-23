import { it, expect } from 'vitest';
import { freshState, nativeStore, stage, unstage } from './state.js';
const options = { key: Buffer.alloc(32, 7).toString('base64'), keyId: 'v1' };
it('stages source bodies encrypted with contextual expiry', () => {
  const state = freshState('deployment', 'owner');
  const value = stage(state, 'one', { secret: 'transcript' }, options, 1000);
  expect(JSON.stringify(value)).not.toContain('transcript');
  expect(unstage(state, 'one', value, options, 1001)).toEqual({ secret: 'transcript' });
  expect(() => unstage(state, 'other', value, options, 1001)).toThrow();
  expect(() => unstage(state, 'one', value, options, 1000 + 86400001)).toThrow('expired');
});
it('pauses a connection without resetting its staged checkpoint', async () => {
  const state = freshState('deployment', 'owner'),
    store = nativeStore(state);
  const c = await store.createConnection({
    connector: 'github',
    label: 'test',
    accountId: 'me',
    config: {}
  });
  state.checkpoints[c.id] = { pending: 'encrypted' };
  state.active = { connectionId: c.id, generation: c.generation };
  await store.changeGeneration(c.id, 'paused');
  expect(state.connections[c.id].generation).toBe(2);
  expect(state.checkpoints[c.id].pending).toBe('encrypted');
  expect(state.connections[c.id].status).toBe('paused');
});
it('commits nested background grant and enrollment consumption together', async () => {
  const state = freshState('deployment', 'owner'),
    store = nativeStore(state);
  await store.saveGrant('enrollment', { status: 'pending', encrypted: { a: 1 } });
  await store.withGrantLock('enrollment', async (/** @type {any} */ row, /** @type {any} */ db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['nested']);
    await store.saveGrant('fulcra', { status: 'ready', encrypted: { b: 2 } }, db);
    return { value: 'ready', patch: { status: 'complete' } };
  });
  expect(state.grants.fulcra.status).toBe('ready');
  expect(state.grants.enrollment.status).toBe('complete');
});
it('rolls back nested grant changes when the serialized grant operation fails', async () => {
  const state = freshState('deployment', 'owner'),
    store = nativeStore(state);
  await store.saveGrant('fulcra', { status: 'ready', encrypted: { a: 1 } });
  await expect(
    store.withGrantLock('fulcra', async () => {
      await store.saveGrant('other', { status: 'ready', encrypted: { b: 2 } });
      throw Error('uncertain');
    })
  ).rejects.toThrow('uncertain');
  expect(state.grants.other).toBeUndefined();
  expect(state.grants.fulcra.encrypted).toEqual({ a: 1 });
});
it('reserves a control/error path when cached results reach capacity', async () => {
  const { cacheResult } = await import('./state.js');
  const state = freshState('deployment', 'owner');
  for (let n = 0; n < 60; n++)
    cacheResult(
      state,
      'command-' + n,
      { httpStatus: 200, body: { text: 'x'.repeat(60000) } },
      options
    );
  cacheResult(state, 'pause', { httpStatus: 200, body: { status: 'paused' } }, options);
  expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(state.commands.pause.result).toBeTruthy();
  expect(Object.values(state.commands).some((/** @type {any} */ x) => x.expired)).toBe(true);
});
