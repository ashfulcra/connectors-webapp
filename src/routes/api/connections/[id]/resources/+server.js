import { json } from '@sveltejs/kit';
import { ownerRuntime, ownedConnection, configurationAction } from '$lib/server/api';
import { getProviderCredential } from '$lib/server/credentials';
import { adapters } from '$lib/server/connectors';
/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
  const { store, crypto } = await ownerRuntime(event),
    connection = await ownedConnection(store, event.params.id);
  return configurationAction(async () => {
    const credential = await getProviderCredential(store, connection.id, crypto);
    const result = await adapters[
      /** @type {keyof typeof adapters} */ (connection.connector)
    ].listResources({
      credential,
      cursor: event.url.searchParams.get('cursor'),
      deadline: Date.now() + 10000
    });
    await store.saveResources(connection.id, result.resources);
    return json(result, { headers: { 'Cache-Control': 'no-store' } });
  });
}
