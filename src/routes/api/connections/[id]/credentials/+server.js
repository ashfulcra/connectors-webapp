import { json } from '@sveltejs/kit';
import { ownerRuntime, ownedConnection, bodyJSON, configurationAction } from '$lib/server/api';
import { seal } from '$lib/server/secrets';
import { adapters } from '$lib/server/connectors';
import { githubInstallationCredential } from '$lib/server/connectors/github-auth';
/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
  const { store, crypto } = await ownerRuntime(event, true),
    connection = await ownedConnection(store, event.params.id),
    input = await bodyJSON(event.request);
  return configurationAction(async () => {
    const credential = await githubInstallationCredential(input.credential ?? {});
    const verified =
      await adapters[/** @type {keyof typeof adapters} */ (connection.connector)].validate(
        credential
      );
    if (verified.accountId !== connection.account_id)
      throw new Error('Account identity changed; create a new connection');
    await store.changeGeneration(connection.id, 'paused');
    const key = 'provider:' + connection.id;
    await store.saveGrant(key, {
      encrypted: seal(credential, `${store.deploymentId}:${store.ownerId}:${key}`, crypto),
      status: 'ready'
    });
    return json({ status: 'paused', detail: 'Credential replaced; preview before enabling.' });
  });
}
