export class DestinationConfigurationError extends Error {}
export const destinationNamespace = 'com.fulcradynamics.connectors.records.v1';
export const connectorFields = {
  type: 'object',
  properties: {
    connector: { type: 'string' },
    source_id: { type: 'string' },
    source_version: { type: 'string' },
    operation: { type: 'string' },
    payload: { type: 'object' }
  },
  required: ['connector', 'source_id', 'operation', 'payload']
};
/** @param {any} client @param {string} ownerId @param {{name?:string,description?:string}} [options] */
export async function ensureDestinationType(client, ownerId, options = {}) {
  const named = Object.hasOwn(options, 'name');
  if (
    named &&
    (typeof options.name !== 'string' ||
      !options.name.trim() ||
      options.name.trim().length > 100 ||
      /[\u0000-\u001f\u007f]/.test(options.name))
  )
    throw new DestinationConfigurationError(
      'Invalid data type name: use 1–100 printable characters'
    );
  if (
    options.description !== undefined &&
    (typeof options.description !== 'string' || options.description.length > 1000)
  )
    throw new DestinationConfigurationError(
      'Invalid data type description: use at most 1000 characters'
    );
  if (Object.keys(options).some((k) => !['name', 'description'].includes(k)))
    throw new DestinationConfigurationError('Invalid data type options');
  if (named)
    return (
      await client.response('input/v1/data_type/Event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (options.name ?? '').trim(),
          description: options.description?.trim() || '',
          api_version: 'v1',
          recordable: true,
          queryable: true,
          record_spec: { schema: JSON.stringify(connectorFields) }
        })
      })
    ).json();
  const types = await client.catalog();
  const matches = types.filter(
    (/** @type {any} */ t) =>
      t.description === destinationNamespace &&
      t.fulcra_userid === ownerId &&
      t.api_version === 'v1'
  );
  if (matches.length > 1)
    throw new DestinationConfigurationError(
      'Ambiguous connector destination type; resolve canonical ID'
    );
  if (matches.length) {
    if (!matches[0].recordable || !matches[0].queryable)
      throw new DestinationConfigurationError('Canonical connector type is not usable');
    return matches[0];
  }
  return (
    await client.response('input/v1/data_type/Event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Connector records',
        description: destinationNamespace,
        api_version: 'v1',
        recordable: true,
        queryable: true,
        record_spec: { schema: JSON.stringify(connectorFields) }
      })
    })
  ).json();
}
