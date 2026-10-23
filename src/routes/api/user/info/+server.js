import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';
import { FulcraAPI } from '$lib/api-client.js';

/**
 * Server-side endpoint to fetch user info from Fulcra API
 * Uses FulcraAPI for organized API access
 */
export async function GET({ cookies }) {
  const accessToken = cookies.get('fulcra_access_token');

  if (!accessToken) {
    throw error(401, 'Not authenticated');
  }

  try {
    const apiClient = new FulcraAPI(env.PUBLIC_FULCRA_API_ENDPOINT, accessToken);

    // Try to get user info
    try {
      const userInfo = await apiClient.getUserInfo();
      return json(userInfo);
    } catch (err) {
      // If user doesn't exist (404), register them first
      if ((err instanceof Error ? err.message : '').includes('404')) {
        console.log('User not found, registering new user...');

        // Register user using low-level post method
        await apiClient.post('user/v0/register', {});

        console.log('User registered successfully, fetching user info...');

        // Now fetch user info again
        const userInfo = await apiClient.getUserInfo();
        return json(userInfo);
      }

      // Re-throw other errors
      throw err;
    }
  } catch (err) {
    console.error('Error fetching user info:', err);
    throw error(500, (err instanceof Error ? err.message : '') || 'Failed to fetch user info');
  }
}
