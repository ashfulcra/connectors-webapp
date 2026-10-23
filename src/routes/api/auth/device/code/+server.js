import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';

/**
 * Server-side proxy for Auth0 device authorization endpoint
 * Bypasses CORS by making the request server-side
 */
export async function POST({ request }) {
  try {
    const deviceCodeRequest = {
      client_id: env.PUBLIC_AUTH0_CLIENT_ID,
      audience: env.PUBLIC_FULCRA_API_ENDPOINT,
      scope: 'openid profile email offline_access'
    };

    const response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceCodeRequest)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw error(response.status, errorData.error_description || 'Failed to start device flow');
    }

    const data = await response.json();
    return json(data);
  } catch (err) {
    console.error('Device code error:', err);
    throw error(500, 'Failed to start device flow');
  }
}
