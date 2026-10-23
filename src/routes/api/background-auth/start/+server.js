import { randomUUID } from 'node:crypto';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { requireOwner } from '$lib/server/owner';
import { runtime, sameOrigin } from '$lib/server/runtime';
import { seal } from '$lib/server/secrets';
/** @type {import('./$types').RequestHandler} */
export async function POST({ cookies, request, url }) {
  await requireOwner(cookies);
  sameOrigin(request, url);
  const { store, crypto } = runtime();
  const response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.PUBLIC_AUTH0_CLIENT_ID,
      audience: env.PUBLIC_FULCRA_API_ENDPOINT,
      scope: 'openid profile email offline_access'
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) error(502, 'Background authorization could not start');
  const data = await response.json();
  const id = randomUUID(),
    key = 'enrollment:' + id;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await store.saveGrant(key, {
    encrypted: seal(
      { deviceCode: data.device_code, interval: data.interval || 5, lastPoll: 0 },
      `${store.deploymentId}:${store.ownerId}:${key}`,
      crypto
    ),
    expiresAt,
    status: 'pending'
  });
  return json(
    {
      enrollmentId: id,
      userCode: data.user_code,
      verificationUri: data.verification_uri_complete || data.verification_uri,
      interval: data.interval || 5,
      expiresAt
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
