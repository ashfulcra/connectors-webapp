import { json, error } from '@sveltejs/kit';
import { ownerRuntime, ownedConnection, bodyJSON, configurationAction } from '$lib/server/api';
import { enableConnection } from '$lib/server/connections';
/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
  const { store, crypto } = await ownerRuntime(event, true),
    connection = await ownedConnection(store, event.params.id),
    input = await bodyJSON(event.request);
  return configurationAction(async () => {
    if (input.action === 'enable')
      return json(await enableConnection(store, connection.id, input.confirmed === true, crypto));
    if (input.action === 'pause') {
      await store.changeGeneration(connection.id, 'paused');
      return json({ status: 'paused' });
    }
    if (input.action === 'disconnect') {
      await store.changeGeneration(connection.id, 'disconnected');
      await store.deleteGrant('provider:' + connection.id);
      return json({ status: 'disconnected' });
    }
    if (input.action === 'retry') {
      if (connection.status !== 'ready') error(400, 'Enable a verified configuration before retry');
      await store.enqueue(connection.id);
      await store.retryQueued(connection.id);
      return json({ status: 'queued' });
    }
    error(400, 'Unknown connection action');
  });
}
