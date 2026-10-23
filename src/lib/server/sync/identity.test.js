import { it, expect } from 'vitest';
import { revisionId } from './identity.js';
const context = {
  ownerId: 'owner',
  dataType: 'Event/type',
  connectorId: 'asana',
  sourceAccountId: 'account',
  routeVersion: 1
};
const change = {
  id: 'task',
  version: 'v1',
  payload: { title: 'One' },
  observedAt: '2026-10-23T10:00:00Z'
};
it('retries retain identity while changes to origin, revision and destination are distinct', () => {
  const first = revisionId(context, change);
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  expect(revisionId(context, { ...change, observedAt: '2026-10-24T10:00:00Z' })).toBe(first);
  for (const delta of [
    { ownerId: 'other' },
    { sourceAccountId: 'other' },
    { dataType: 'Event/other' },
    { routeVersion: 2 }
  ])
    expect(revisionId({ ...context, ...delta }, change)).not.toBe(first);
  expect(revisionId(context, { ...change, version: 'v2' })).not.toBe(first);
  expect(revisionId(context, { ...change, payload: { title: 'Changed' } })).not.toBe(first);
});
