import {json} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {env as publicEnv} from '$env/dynamic/public';
import {requireOwner} from '$lib/server/owner';
import {FulcraClient} from '$lib/server/fulcra';
import {listRunEvents} from '$lib/server/harness';
/** @type {import('./$types').RequestHandler} */
export async function GET({cookies}) {
  const {accessToken}=await requireOwner(cookies);
  return json(await listRunEvents(new FulcraClient({endpoint:publicEnv.PUBLIC_FULCRA_API_ENDPOINT,accessToken}), env.HARNESS_DATA_TYPE), {headers:{'Cache-Control':'no-store'}});
}
