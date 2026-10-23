import { ownerRuntime, bodyJSON } from '$lib/server/api';
import { ensureDestinationType, DestinationConfigurationError } from '$lib/server/destination-type';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { requireOwner } from '$lib/server/owner';
import { FulcraClient } from '$lib/server/fulcra';
/** @type {import('./$types').RequestHandler} */
export async function GET({ cookies }) {
  const { userId, accessToken } = await requireOwner(cookies);
  const types = await new FulcraClient({
    endpoint: env.PUBLIC_FULCRA_API_ENDPOINT,
    accessToken
  }).catalog();
  return json(
    {
      types: types.filter(
        /** @param {any} type */ (type) =>
          type.fulcra_userid === userId &&
          type.recordable &&
          type.queryable &&
          type.api_version === 'v1'
      )
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
  const { store, owner } = await ownerRuntime(event, true);
  const options = await bodyJSON(event.request, { allowEmpty: true });
  if (!options || typeof options !== 'object' || Array.isArray(options))
    error(400, 'Invalid data type options');
  try {
    const result = await store.withGrantLock('destination-type', async () => ({
      value: await ensureDestinationType(
        new FulcraClient({
          endpoint: env.PUBLIC_FULCRA_API_ENDPOINT,
          accessToken: owner.accessToken
        }),
        owner.userId,
        options
      )
    }));
    return json({ type: result.value }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    if (cause instanceof DestinationConfigurationError) error(400, cause.message);
    // Remote creation may have committed. Preserve uncertainty and the native command ID.
    throw cause;
  }
}
