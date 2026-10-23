import { test } from 'node:test';
import assert from 'node:assert/strict';

const module = await import('./harness-events.mjs').catch(() => ({}));
const createRunEvent = module.createRunEvent ?? (() => assert.fail('createRunEvent is not implemented'));
const ingestRunEvent = module.ingestRunEvent ?? (() => assert.fail('ingestRunEvent is not implemented'));
const event = { run_id: 'run-1', milestone_id: 'M1', role: 'Nurse', step: 'RUN_START', status: 'started', detail: 'Health check', evidence: 'Authenticated schema read returned 200', revision: '5157aea' };

test('blank evidence cannot become a run record', () => {
  assert.throws(() => createRunEvent({ ...event, evidence: '  ' }), /evidence is required/);
});

test('run evidence is stored as typed v1 fields with a real timestamp', () => {
  const record = createRunEvent(event);
  assert.equal(record.evidence, 'Authenticated schema read returned 200');
  assert.equal(record.run_id, 'run-1');
  assert.match(record.id, /^[0-9a-f-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(record.start_time)));
  assert.equal(record.note, undefined);
});

test('run transport writes only v1 Event records and rejects annotation IDs', async () => {
  const requests = [];
  const request = async (path, options) => { requests.push({ path, ...options }); return { upload_id: 'receipt' }; };
  const record = { ...event, id: 'bcb1804a-a526-43a2-9e98-93742ab9ec49', start_time: '2026-10-23T12:00:00Z' };
  assert.deepEqual(await ingestRunEvent(request, 'Event/10ca7c4d-21ad-4a20-8fba-37a45c39f4fb', record), { upload_id: 'receipt' });
  assert.equal(requests[0].path, '/ingest/v1/record/Event%2F10ca7c4d-21ad-4a20-8fba-37a45c39f4fb?api_version=v1');
  assert.equal(requests[0].body, JSON.stringify(record) + '\n');
  assert.equal(requests[0].contentType, 'application/x-jsonl');
  await assert.rejects(async () => ingestRunEvent(request, 'MomentAnnotation/id', record), /v1 Event/);
  assert.equal(requests.length, 1);
});
