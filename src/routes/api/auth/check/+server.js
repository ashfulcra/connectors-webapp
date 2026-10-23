import { json } from '@sveltejs/kit';

/**
 * Check if user has a valid access token cookie
 * Returns authenticated status without exposing the token to the client
 */
export async function GET({ cookies }) {
  const accessToken = cookies.get('fulcra_access_token');

  return json({
    authenticated: !!accessToken
  });
}
