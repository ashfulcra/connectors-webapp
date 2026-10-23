import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { requireOwner } from '$lib/server/owner';
import { FulcraClient } from '$lib/server/fulcra';
/** @type {import('./$types').RequestHandler} */
export async function GET({ cookies }) {
  const { accessToken } = await requireOwner(cookies);
  const listing = await new FulcraClient({
    endpoint: env.PUBLIC_FULCRA_API_ENDPOINT,
    accessToken
  }).json('input/v1/file_upload?path=%2F');
  return json({ folders: listing.folders ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
