import { error } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/** @param {Pick<import('@sveltejs/kit').Cookies, 'get'>} cookies
 * @param {{ fetchImpl?: typeof fetch }} options */
export async function requireOwner(cookies, { fetchImpl = fetch } = {}) {
  const accessToken = cookies.get('fulcra_access_token');
  if (!accessToken) error(401, 'Sign in to continue');
  if (!privateEnv.OWNER_USER_ID) error(503, 'Deployment owner is not configured');
  let response;
  try {
    response = await fetchImpl(new URL('user/v1alpha1/info', publicEnv.PUBLIC_FULCRA_API_ENDPOINT).href, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000)
    });
  } catch { error(503, 'Identity verification is unavailable'); }
  if (response.status === 401 || response.status === 403) error(401, 'Sign in again');
  if (!response.ok) error(503, 'Identity verification is unavailable');
  const info = await response.json();
  if (info.userid !== privateEnv.OWNER_USER_ID) error(403, 'This deployment belongs to another Fulcra user');
  return { userId: info.userid, accessToken };
}
