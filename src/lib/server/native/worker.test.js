import { unseal } from '../secrets.js';
import { it, expect } from 'vitest';
import { freshState, stage, unstage } from './state.js';
import { advanceWorker } from './worker.js';
const crypto = { key: Buffer.alloc(32, 7).toString('base64'), keyId: 'v1' };
function fixture() {
  const s = freshState('d', 'o');
  s.grants.fulcra = {
    status: 'ready',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    encrypted: {}
  };
  s.connections.c = {
    id: 'c',
    connector: 'test',
    generation: 1,
    status: 'ready',
    account_id: 'a',
    nextDue: 0,
    config: {
      intervalSeconds: 60,
      routeVersion: 1,
      route: { mode: 'both', ownerId: 'o', folder: '/test', recordType: 'Event/test' }
    }
  };
  return s;
}
it('records intent and allocation durably before file transfer; checkpoint waits for both sinks', async () => {
  let s = fixture();
  /** @type {string[]} */
  const calls = [];
  const client = {
    catalog: async () => [
      { id: 'Event/test', fulcra_userid: 'o', recordable: true, queryable: true, api_version: 'v1' }
    ],
    schema: async () => ({ type: 'object', properties: { payload: { type: 'object' } } }),
    findFileByHash: async () => null,
    allocateFile: async () => {
      calls.push('allocate');
      return { file: { id: 'file' }, url: 'https://upload.test' };
    },
    transferFile: async () => {
      calls.push('transfer');
    },
    readRecord: async () => null,
    writeRecords: async () => {
      calls.push('record');
      return { upload_id: 'upload' };
    },
    readFileBytes: async () => new TextEncoder().encode('{}')
  };
  const deps = {
    crypto,
    client,
    provider: async () => ({}),
    adapters: {
      test: {
        readPage: async () => ({
          changes: [{ id: 'one', timestamp: '2026-10-23T00:00:00Z', version: '1', payload: {} }],
          candidateCheckpoint: { next: 'cursor' }
        })
      }
    }
  };
  s = await advanceWorker(s, deps);
  expect(calls).toEqual([]);
  s = await advanceWorker(s, deps);
  expect(calls).toEqual([]);
  s = await advanceWorker(s, deps);
  expect(calls).toEqual([]);
  expect(unstage(s, 'pending:c', s.checkpoints.c.pending, crypto).items[0].receipt.status).toBe(
    'intent'
  );
  const deadline=unseal(s.checkpoints.c.pending,'d:o:native:pending:c',crypto).expiresAt;
  await new Promise(resolve=>setTimeout(resolve,5));
  s = await advanceWorker(s, deps);
  expect(calls).toEqual(['allocate']);
  expect(unseal(s.checkpoints.c.pending,'d:o:native:pending:c',crypto).expiresAt).toBe(deadline);
  expect(unstage(s, 'pending:c', s.checkpoints.c.pending, crypto).items[0].receipt.inputId).toBe(
    'file'
  );
  s = await advanceWorker(s, deps);
  expect(calls).toEqual(['allocate', 'transfer']);
  expect(s.checkpoints.c.value).toBeUndefined();
  s = await advanceWorker(s, deps);
  expect(calls).toContain('record');
  expect(s.checkpoints.c.value).toBeUndefined();
});
it('stale paused generation cannot issue a remote operation', async () => {
  const s = fixture();
  s.active = { connectionId: 'c', generation: 1, phase: 'deliver' };
  s.connections.c.generation = 2;
  s.connections.c.status = 'paused';
  const next = await advanceWorker(s, {
    crypto,
    client: {
      writeRecords: () => {
        throw Error('must not write');
      }
    }
  });
  expect(next.active).toBeNull();
});
it('missing background grant performs no provider collection', async () => {
  const s = fixture();
  delete s.grants.fulcra;
  await advanceWorker(s, {
    crypto,
    provider: () => {
      throw Error('must not read');
    }
  });
  expect(s.active).toBeNull();
});
it('commits cursor only after file and record content readback both verify', async () => {
  let s = fixture();
  /** @type {any} */ let record;
  const client = {
    catalog: async () => [
      { id: 'Event/test', fulcra_userid: 'o', recordable: true, queryable: true, api_version: 'v1' }
    ],
    schema: async () => ({ type: 'object', properties: { payload: { type: 'object' } } }),
    findFileByHash: async () => null,
    allocateFile: async () => ({ file: { id: 'file' }, url: 'https://upload.test' }),
    transferFile: async () => {},
    readRecord: async () => record,
    writeRecords: async (/** @type {string} */ type, /** @type {any[]} */ records) => {
      record = records[0];
      return { upload_id: 'upload' };
    },
    readFileBytes: async () => new TextEncoder().encode('{}')
  };
  const deps = {
    crypto,
    client,
    provider: async () => ({}),
    adapters: {
      test: {
        readPage: async () => ({
          changes: [{ id: 'one', timestamp: '2026-10-23T00:00:00Z', version: '1', payload: {} }],
          candidateCheckpoint: { next: 'cursor' }
        })
      }
    }
  };
  for (let n = 0; n < 14 && !s.connections.c.lastVerified; n++) s = await advanceWorker(s, deps);
  expect(s.connections.c.lastVerified).toBeTruthy();
  expect(unstage(s, 'value:c', s.checkpoints.c.value, crypto)).toEqual({ next: 'cursor' });
  expect(s.checkpoints.c.pending).toBeUndefined();
  expect(s.deliveries.c.every((/** @type {any} */ r) => r.status === 'verified')).toBe(true);
});
it('discards expired transfer capabilities after reconciliation and reallocates', async () => {
  let s = fixture();
  s.connections.c.config.route.mode = 'file';
  s.active = { connectionId: 'c', generation: 1, phase: 'deliver' };
  s.checkpoints.c = {
    pending: stage(
      s,
      'pending:c',
      {
        outputs: [{ files: [{ content: '{}', contentType: 'application/json' }] }],
        items: [
          {
            outputIndex: 0,
            fileIndex: 0,
            receipt: {
              sink: 'file',
              path: '/test/one',
              hash: 'hash',
              inputId: 'old',
              status: 'allocated',
              transfer: { url: 'https://expired.test' }
            }
          }
        ]
      },
      crypto
    )
  };
  let allocations = 0;
  const client = {
    findFileByHash: async () => null,
    transferFile: async () => {
      throw Error('File transfer returned 403');
    },
    allocateFile: async () => {
      allocations++;
      return { file: { id: 'new' }, url: 'https://new.test' };
    }
  };
  const deps = { crypto, client };
  s = await advanceWorker(s, deps);
  let pending = unstage(s, 'pending:c', s.checkpoints.c.pending, crypto);
  expect(pending.items[0].receipt.transfer).toBeUndefined();
  s.connections.c.nextDue = 0;
  for (let n = 0; n < 4; n++) s = await advanceWorker(s, deps);
  expect(allocations).toBe(1);
});
it('surfaces hash failures and pauses instead of retrying immutable bad objects forever', async () => {
  const s = fixture();
  s.active = { connectionId: 'c', generation: 1, phase: 'verify', verifyIndex: 0 };
  s.checkpoints.c = {
    pending: stage(
      s,
      'pending:c',
      {
        items: [{ receipt: { sink: 'file', inputId: 'bad', hash: 'incorrect', status: 'pending' } }]
      },
      crypto
    )
  };
  await advanceWorker(s, {
    crypto,
    client: { readFileBytes: async () => new TextEncoder().encode('wrong') }
  });
  expect(s.connections.c.failedItems).toBe(1);
  expect(s.connections.c.status).toBe('paused');
  expect(s.connections.c.lastError).toContain('verification_failed');
  expect(s.checkpoints.c.value).toBeUndefined();
});
