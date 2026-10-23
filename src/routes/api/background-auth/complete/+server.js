import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { requireOwner } from '$lib/server/owner';
import { runtime, sameOrigin } from '$lib/server/runtime';
import { seal, unseal } from '$lib/server/secrets';
/** @type {import('./$types').RequestHandler} */
export async function POST({ cookies, request, url }) {
  await requireOwner(cookies);
  sameOrigin(request, url);
  const { store, crypto } = runtime();
  const { enrollmentId } = await request.json();
  if (
    typeof enrollmentId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(enrollmentId)
  )
    error(400, 'Invalid enrollment');
  const key = 'enrollment:' + enrollmentId,
    context = `${store.deploymentId}:${store.ownerId}:${key}`;
  const result = await store.withGrantLock(
    key,
    async (/** @type {any} */ row, /** @type {any} */ db) => {
      // A response may be lost after the grant was durably saved. Do not exchange
      // the one-use device code again, or revive a subsequently disconnected grant.
      if (row?.status === 'complete') {
        const grant = await store.getGrant('fulcra');
        return { value: { status: grant?.status === 'ready' ? 'ready' : 'reauthorize' } };
      }
      if (!row || row.status !== 'pending' || Date.parse(row.expiresAt) < Date.now())
        error(400, 'Enrollment expired; start again');
      const pending = unseal(row.encrypted, context, crypto);
      if (Date.now() - pending.lastPoll < pending.interval * 1000)
        return { value: { status: 'pending', interval: pending.interval } };
      pending.lastPoll = Date.now();
      const response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: pending.deviceCode,
          client_id: env.PUBLIC_AUTH0_CLIENT_ID
        }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await response.json();
      if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        if (data.error === 'slow_down') pending.interval += 5;
        return {
          value: { status: 'pending', interval: pending.interval },
          patch: { encrypted: seal(pending, context, crypto) }
        };
      }
      if (!response.ok || !data.refresh_token || !data.access_token)
        return { value: { status: 'reauthorize' }, patch: { status: 'reauthorize' } };
      // Verify that the newly authorized grant belongs to this deployment owner.
      const identity = await fetch(new URL('user/v1alpha1/info', env.PUBLIC_FULCRA_API_ENDPOINT), {
        headers: { Authorization: `Bearer ${data.access_token}` },
        signal: AbortSignal.timeout(10000)
      });
      if (!identity.ok || (await identity.json()).userid !== store.ownerId)
        return { value: { status: 'wrong_account' }, patch: { status: 'reauthorize' } };
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${store.deploymentId}:${store.ownerId}:fulcra`
      ]);
      await store.saveGrant(
        'fulcra',
        {
          encrypted: seal(
            { access_token: data.access_token, refresh_token: data.refresh_token },
            `${store.deploymentId}:${store.ownerId}:fulcra`,
            crypto
          ),
          expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          status: 'ready'
        },
        db
      );
      return {
        value: { status: 'ready' },
        patch: { status: 'complete', encrypted: seal({}, context, crypto) }
      };
    }
  );
  return json(result.value, { headers: { 'Cache-Control': 'no-store' } });
}
