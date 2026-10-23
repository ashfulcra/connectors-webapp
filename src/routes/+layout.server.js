import { env } from '$env/dynamic/private';
import { instanceMode } from '$lib/server/instance-access';
import { isHttpError } from '@sveltejs/kit';
import { requireOwner } from '$lib/server/owner';
/** @type {import('./$types').LayoutServerLoad} */
export async function load({ cookies, setHeaders, url }) {
  setHeaders({ 'Cache-Control': 'private, no-store' });
  const personal = instanceMode(env.CONNECTORS_MODE) === 'personal';
  if (url.pathname === '/' || url.pathname === '/guide' || url.pathname === '/login')
    return { isOwner: false, personal };
  if (!cookies.get('fulcra_access_token')) return { isOwner: false, personal };
  try {
    await requireOwner(cookies);
    return { isOwner: true, personal };
  } catch (e) {
    if (isHttpError(e) && e.status === 401) return { isOwner: false, personal };
    throw e;
  }
}
