import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { requireOwner } from '$lib/server/owner';
import { runtime, sameOrigin } from '$lib/server/runtime';
import { disconnectFulcraCredential } from '$lib/server/credentials';
/** @type {import('./$types').RequestHandler} */
export async function POST({ cookies, request, url }) {
  await requireOwner(cookies);
  sameOrigin(request, url);
  const { store, crypto } = runtime();
  const status = await disconnectFulcraCredential(store, {
    crypto,
    clientId: env.PUBLIC_AUTH0_CLIENT_ID,
    auth0Domain: env.PUBLIC_AUTH0_DOMAIN
  });
  return json(
    { status },
    {
      status: status === 'revocation_pending' ? 502 : 200,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
