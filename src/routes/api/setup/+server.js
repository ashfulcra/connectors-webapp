import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireOwner } from '$lib/server/owner';
import { runtime } from '$lib/server/runtime';
/** @type {import('./$types').RequestHandler} */
export async function GET({ cookies }) {
  await requireOwner(cookies);
  const missing = ['DATABASE_URL', 'CONNECTORS_DEPLOYMENT_ID', 'CREDENTIAL_ENCRYPTION_KEY'].filter(
    (k) => !env[k]
  );
  if (missing.length)
    return json(
      {
        ready: false,
        missing,
        backgroundStatus: 'required_configuration',
        schedulerStatus: 'unverified'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  try {
    const { store } = runtime();
    await store.assertOwner();
    const grant = await store.getGrant('fulcra');
    return json(
      {
        ready: true,
        missing: [],
        backgroundStatus: grant?.status ?? 'required_configuration',
        schedulerStatus: env.CRON_SECRET ? 'endpoint_configured' : 'required_configuration'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return json(
      {
        ready: false,
        missing: ['Database connectivity or migration'],
        backgroundStatus: 'unknown',
        schedulerStatus: 'unverified'
      },
      { status: 503 }
    );
  }
}
