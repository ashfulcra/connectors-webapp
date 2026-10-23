import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { runtime } from '$lib/server/runtime';
import { authorizeCron } from '$lib/server/cron-auth';
import { getFulcraCredential, getProviderCredential } from '$lib/server/credentials';
import { FulcraClient } from '$lib/server/fulcra';
import { runTick } from '$lib/server/sync/runner';
import { adapters } from '$lib/server/connectors';
export const config = { maxDuration: 60 };
/** @type {import('./$types').RequestHandler} */
export async function GET({ request }) {
  try {
    authorizeCron(request.headers, env.CRON_SECRET);
  } catch {
    error(401, 'Unauthorized scheduler');
  }
  const deadline = Date.now() + 45000;
  const { store, crypto } = runtime();
  const result = await runTick({
    store,
    adapters,
    deadline,
    maxJobs: 2,
    credentials: (connection) => getProviderCredential(store, connection.id, crypto),
    getClient: async () =>
      new FulcraClient({
        endpoint: publicEnv.PUBLIC_FULCRA_API_ENDPOINT,
        accessToken: await getFulcraCredential(store, {
          crypto,
          clientId: publicEnv.PUBLIC_AUTH0_CLIENT_ID,
          auth0Domain: publicEnv.PUBLIC_AUTH0_DOMAIN
        }),
        deadline
      })
  });
  return json(result, { headers: { 'Cache-Control': 'no-store' } });
}
