import {json} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {env as publicEnv} from '$env/dynamic/public';
import {requireOwner} from './owner';
import {FulcraClient} from './fulcra';
/** @param {string} name @returns {import('@sveltejs/kit').RequestHandler} */
export function workspaceRoute(name) {
  return async ({cookies}) => {
    const {accessToken}=await requireOwner(cookies);
    const text=await new FulcraClient({endpoint:publicEnv.PUBLIC_FULCRA_API_ENDPOINT,accessToken}).readFile(`${env.WORKSPACE_PATH}/${name}.md`);
    return json({text},{headers:{'Cache-Control':'no-store'}});
  };
}
