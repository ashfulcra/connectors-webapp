import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';

/**
 * Server-side proxy for Auth0 device token endpoint
 * Bypasses CORS by making the request server-side
 */
export async function POST({ request }) {
  const { deviceCode } = await request.json();

  if (!deviceCode) {
    throw error(400, 'Device code required');
  }

  try {
    const response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: env.PUBLIC_AUTH0_CLIENT_ID
      })
    });

    const data = await response.json();

    // Return the response data along with status
    // Client will handle authorization_pending, slow_down, etc.
    return json({ status: response.status, data });
  } catch (err) {
    console.error('Device token error:', err);
    throw error(500, 'Failed to poll for token');
  }
}
