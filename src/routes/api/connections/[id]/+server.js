import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { ownerRuntime, ownedConnection, bodyJSON, configurationAction } from '$lib/server/api';
import { configurationUpdate } from '$lib/server/connections';
import { validateRoute } from '$lib/server/sync/sinks';
import { FulcraClient } from '$lib/server/fulcra';
/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
  const { store } = await ownerRuntime(event);
  const connection = await ownedConnection(store, event.params.id);
  return json(
    { connection, status: await store.connectionStatus(connection.id) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
/** @type {import('./$types').RequestHandler} */
export async function PUT(event) {
  const { store, owner } = await ownerRuntime(event, true),
    connection = await ownedConnection(store, event.params.id),
    input = await bodyJSON(event.request);
  return configurationAction(async () => {
    const resources = await store.getResources(connection.id);
    const { config, resetCheckpoint, changed } = configurationUpdate(
      connection.config,
      input,
      resources.map((/** @type {any} */ r) => r.id),
      owner.userId
    );

    const client = new FulcraClient({
      endpoint: env.PUBLIC_FULCRA_API_ENDPOINT,
      accessToken: owner.accessToken
    });
    validateRoute(
      config.route,
      config.route.mode === 'file' ? [] : await client.catalog(),
      config.route.mode === 'file' ? {} : await client.schema(config.route.recordType)
    );
    if (!changed) return json({ connection });
    const saved = await store.changeGeneration(
      connection.id,
      'draft',
      config,
      connection.generation,
      resetCheckpoint
    );
    return json({ connection: saved });
  });
}
