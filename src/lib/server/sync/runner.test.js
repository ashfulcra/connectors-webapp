import { it, expect, vi } from 'vitest';
import { runTick } from './runner.js';
/** @param {any} options */
function fixture(options = {}) {
  const job = { id: 'job', connection_id: 'connection', generation: 1, lease_token: 'lease' };
  const connection = {
    id: 'connection',
    connector: 'test',
    account_id: 'account',
    config: {
      resources: ['selected'],
      route: { mode: 'record', recordType: 'Event/test' },
      routeVersion: 1,
      intervalSeconds: 60
    }
  };
  const store = {
    ownerId: 'owner',
    claimDueJobs: vi.fn().mockResolvedValue([job]),
    getConnection: vi.fn().mockResolvedValue(connection),
    getCheckpoint: vi.fn().mockResolvedValue({ value: { cursor: 'old' }, pending: null }),
    savePending: vi.fn(),
    saveDelivery: vi.fn(),
    getDeliveries: vi.fn().mockResolvedValue([]),
    assertLease: vi.fn(),
    withLease: vi.fn().mockImplementation(async (_j, fn) => fn({})),
    reschedule: vi.fn(),
    commitCheckpoint: vi.fn()
  };
  const page = {
    changes: [
      {
        id: 'source',
        version: 'v1',
        operation: 'upsert',
        timestamp: '2026-01-01T00:00:00Z',
        payload: { title: 'Example' }
      }
    ],
    candidateCheckpoint: { cursor: 'new' }
  };
  const adapter = { readPage: vi.fn().mockResolvedValue(page) };
  const client = {
    schema: vi.fn().mockResolvedValue({ type: 'object' }),
    writeRecords: vi.fn().mockResolvedValue({ upload_id: 'accepted' }),
    readRecord: vi.fn().mockResolvedValue(undefined)
  };
  return { store, adapter, client, ...options };
}
it('accepted ingestion without readback keeps the old cursor and reschedules verification', async () => {
  const f = fixture();
  await runTick({
    ...f,
    adapters: { test: f.adapter },
    credentials: async () => ({}),
    getClient: async () => f.client,
    deadline: Date.now() + 10000,
    maxJobs: 1
  });
  expect(f.store.commitCheckpoint).not.toHaveBeenCalled();
  expect(f.store.savePending).toHaveBeenCalled();
  expect(f.store.reschedule).toHaveBeenCalled();
});
it('resumes a saved page and receipt without fetching or writing it again', async () => {
  const f = fixture();
  const record = { id: '11111111-1111-4111-8111-111111111111', payload: { title: 'Example' } };
  f.store.getCheckpoint.mockResolvedValue({
    value: { cursor: 'old' },
    pending: { outputs: [{ record, files: [] }], candidateCheckpoint: { cursor: 'new' } }
  });
  f.store.getDeliveries.mockResolvedValue([
    {
      sink: 'record',
      id: record.id,
      dataType: 'Event/test',
      fields: ['id', 'payload'],
      hash: 'unused',
      status: 'verified'
    }
  ]);
  await runTick({
    ...f,
    adapters: { test: f.adapter },
    credentials: async () => ({}),
    getClient: async () => f.client,
    deadline: Date.now() + 10000,
    maxJobs: 1
  });
  expect(f.adapter.readPage).not.toHaveBeenCalled();
  expect(f.client.writeRecords).not.toHaveBeenCalled();
  expect(f.store.commitCheckpoint).toHaveBeenCalledWith(
    expect.anything(),
    { cursor: 'new' },
    expect.any(Date)
  );
});
it('rate limits reschedule at the provider retry time', async () => {
  const f = fixture();
  const retryAt = new Date(Date.now() + 120000).toISOString();
  f.adapter.readPage.mockResolvedValue({ changes: [], retryAt });
  await runTick({
    ...f,
    adapters: { test: f.adapter },
    credentials: async () => ({}),
    getClient: async () => f.client,
    deadline: Date.now() + 10000,
    maxJobs: 1
  });
  expect(f.store.reschedule).toHaveBeenCalledWith(
    expect.anything(),
    new Date(retryAt),
    'rate_limited'
  );
  expect(f.store.commitCheckpoint).not.toHaveBeenCalled();
});
it('an exhausted deadline does not claim work', async () => {
  const f = fixture();
  await runTick({
    ...f,
    adapters: { test: f.adapter },
    credentials: async () => ({}),
    getClient: async () => f.client,
    deadline: Date.now() - 1,
    maxJobs: 1
  });
  expect(f.store.claimDueJobs).not.toHaveBeenCalled();
});
it('checks current destination queryability before submitting any record', async () => {
  const f = fixture();
  const catalog = vi
    .fn()
    .mockResolvedValue([
      {
        id: 'Event/test',
        fulcra_userid: 'owner',
        recordable: true,
        queryable: false,
        api_version: 'v1'
      }
    ]);
  Object.assign(f.client, { catalog });
  await runTick({
    ...f,
    adapters: { test: f.adapter },
    credentials: async () => ({}),
    getClient: async () => f.client,
    deadline: Date.now() + 10000,
    maxJobs: 1
  });
  expect(f.client.writeRecords).not.toHaveBeenCalled();
  expect(f.store.commitCheckpoint).not.toHaveBeenCalled();
});
