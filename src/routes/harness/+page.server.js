import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { requireOwnerPage } from '$lib/server/owner-page';
import { FulcraClient } from '$lib/server/fulcra';
import { listRunEvents } from '$lib/server/harness';
/** @type {import('./$types').PageServerLoad} */
export async function load({ cookies }) {
  const { accessToken } = await requireOwnerPage(cookies);
  const client = new FulcraClient({ endpoint: publicEnv.PUBLIC_FULCRA_API_ENDPOINT, accessToken });
  const [runs, overview, issues] = await Promise.all([
    listRunEvents(client, env.HARNESS_DATA_TYPE),
    client.readFile(`${env.WORKSPACE_PATH}/overview.md`),
    client.readFile(`${env.WORKSPACE_PATH}/outstanding-issues.md`)
  ]);
  return { dashboard: { runs, overview, issues } };
}
