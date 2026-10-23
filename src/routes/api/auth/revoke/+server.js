import { env } from '$env/dynamic/public';
import { json } from '@sveltejs/kit';

/**
 * Server-side proxy for Auth0 token revocation.
 *
 * Revokes a refresh token so it can no longer be exchanged for new access
 * tokens. Called during logout. Proxied server-side because Auth0's
 * /oauth/revoke endpoint does not permit CORS requests from the browser.
 *
 * Best-effort: the client does not block logout on the result.
 */
export async function POST({ request }) {
  const { refreshToken } = await request.json();

  if (!refreshToken) {
    return json({ error: 'No refresh token provided' }, { status: 400 });
  }

  const response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.PUBLIC_AUTH0_CLIENT_ID,
      token: refreshToken
    })
  });

  // Auth0 returns 200 with an empty body on success.
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.error('Token revoke failed:', data);
    return json({ success: false }, { status: response.status });
  }

  return json({ success: true });
}
