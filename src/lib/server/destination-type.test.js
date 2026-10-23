import { it, expect, vi } from 'vitest';
import {
  ensureDestinationType,
  destinationNamespace,
  connectorFields
} from './destination-type.js';
it('uses only an owned usable canonical v1 type and refuses an unusable match', async () => {
  const type = {
    id: 'Event/canonical',
    fulcra_userid: 'owner',
    api_version: 'v1',
    description: destinationNamespace,
    recordable: false,
    queryable: true
  };
  const client = { catalog: vi.fn().mockResolvedValue([type]), response: vi.fn() };
  await expect(ensureDestinationType(client, 'owner')).rejects.toThrow(/usable/i);
  expect(client.response).not.toHaveBeenCalled();
});
it('creates the nested payload schema through the v1 Event type endpoint', async () => {
  const client = {
    catalog: vi.fn().mockResolvedValue([]),
    response: vi.fn().mockResolvedValue(Response.json({ id: 'Event/created' }))
  };
  await expect(ensureDestinationType(client, 'owner')).resolves.toEqual({ id: 'Event/created' });
  expect(client.response).toHaveBeenCalledWith(
    'input/v1/data_type/Event',
    expect.objectContaining({ method: 'POST' })
  );
  const body = JSON.parse(client.response.mock.calls[0][1].body);
  expect(body.api_version).toBe('v1');
  expect(JSON.parse(body.record_spec.schema)).toEqual(connectorFields);
});

it('reuses ownership metadata from the catalog, since input specs omit owner IDs', async () => {
  const type = {
    id: 'Event/canonical',
    fulcra_userid: 'owner',
    api_version: 'v1',
    description: destinationNamespace,
    recordable: true,
    queryable: true
  };
  const client = { catalog: vi.fn().mockResolvedValue([type]), response: vi.fn() };
  await expect(ensureDestinationType(client, 'owner')).resolves.toEqual(type);
  expect(client.response).not.toHaveBeenCalled();
});
it('creates a named owned-compatible v1 Event type without reusing the standard destination', async () => {
  const client = {
    catalog: vi.fn().mockResolvedValue([
      {
        id: 'Event/standard',
        description: destinationNamespace,
        fulcra_userid: 'owner',
        api_version: 'v1',
        recordable: true,
        queryable: true
      }
    ]),
    response: vi.fn().mockResolvedValue(Response.json({ id: 'Event/named' }))
  };
  const result = await ensureDestinationType(client, 'owner', {
    name: 'Project updates',
    description: 'Selected issue and task updates'
  });
  expect(result.id).toBe('Event/named');
  const body = JSON.parse(client.response.mock.calls[0][1].body);
  expect(body).toMatchObject({
    name: 'Project updates',
    description: 'Selected issue and task updates',
    api_version: 'v1',
    recordable: true,
    queryable: true
  });
  expect(JSON.parse(body.record_spec.schema)).toEqual(connectorFields);
});
it('rejects invalid named type inputs before contacting Fulcra', async () => {
  const client = { catalog: vi.fn(), response: vi.fn() };
  for (const options of [
    { name: '' },
    { name: 'a'.repeat(101) },
    { name: 'Valid', description: 45 },
    { name: 'Valid', description: 'a'.repeat(1001) }
  ])
    await expect(
      ensureDestinationType(client, 'owner', /** @type {any} */ (options))
    ).rejects.toThrow(/Invalid/);
  expect(client.response).not.toHaveBeenCalled();
});
