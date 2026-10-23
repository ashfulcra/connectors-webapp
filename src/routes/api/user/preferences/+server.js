import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';
import { FulcraAPI } from '$lib/api-client.js';

/**
 * Server-side endpoint to fetch user preferences from Fulcra API
 * Demonstrates using FulcraAPI's high-level methods
 */
export async function GET({ cookies }) {
  const accessToken = cookies.get('fulcra_access_token');

  if (!accessToken) {
    throw error(401, 'Not authenticated');
  }

  try {
    const apiClient = new FulcraAPI(env.PUBLIC_FULCRA_API_ENDPOINT, accessToken);
    const preferences = await apiClient.getUserPreferences();
    return json(preferences);
  } catch (err) {
    console.error('Error fetching user preferences:', err);
    throw error(500, (err instanceof Error ? err.message : '') || 'Failed to fetch user preferences');
  }
}
