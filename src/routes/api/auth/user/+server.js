import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';

/**
 * Server-side endpoint to get Auth0 user info
 * Uses the access token from the HTTP-only cookie
 */
export async function GET({ cookies }) {
  const accessToken = cookies.get('fulcra_access_token');

  if (!accessToken) {
    throw error(401, 'Not authenticated');
  }

  try {
    const response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw error(response.status, 'Failed to get user info from Auth0');
    }

    const userInfo = await response.json();
    return json(userInfo);
  } catch (err) {
    console.error('Error fetching Auth0 user info:', err);
    throw error(500, (err instanceof Error ? err.message : '') || 'Failed to fetch Auth0 user info');
  }
}
