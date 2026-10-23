import { json, error } from '@sveltejs/kit';
import { runtime } from '$lib/server/runtime';
import { unseal } from '$lib/server/secrets';
import {
  verifyGranola,
  verifyGitHub,
  verifySlack
} from '$lib/server/connectors/webhook-signatures';
/** @type {import('./$types').RequestHandler} */
export async function POST({ request, params }) {
  const { store, crypto } = runtime();
  const connection = await store.getConnection(params.connection);
  if (
    !connection ||
    connection.connector !== params.provider ||
    !['ready', 'paused'].includes(connection.status)
  )
    error(404, 'Unknown webhook');
  const key = 'provider:' + connection.id,
    grant = await store.getGrant(key);
  if (!grant || grant.status !== 'ready') error(401, 'Webhook unavailable');
  const credential = unseal(
    grant.encrypted,
    `${store.deploymentId}:${store.ownerId}:${key}`,
    crypto
  );
  if (!credential.webhookSecret) error(401, 'Webhook unavailable');
  if (Number(request.headers.get('content-length')) > 128000) error(413, 'Webhook too large');
  const body = await request.text();
  if (body.length > 128000) error(413, 'Webhook too large');
  let eventId;
  try {
    if (params.provider === 'slack') {
      verifySlack(body, request.headers, credential.webhookSecret);
    } else if (params.provider === 'github')
      eventId = verifyGitHub(body, request.headers, credential.webhookSecret);
    else if (params.provider === 'granola')
      eventId = verifyGranola(body, request.headers, credential.webhookSecret);
    else error(404, 'Unsupported webhook');
  } catch {
    error(401, 'Invalid webhook signature');
  }
  const data = JSON.parse(body);
  if (params.provider === 'slack' && data.type === 'url_verification')
    return json({ challenge: data.challenge });
  const resources = connection.config.resources ?? [];
  let hint = {};
  if (params.provider === 'slack') {
    const event = data.event ?? {};
    eventId = data.event_id;
    if (!resources.includes(event.channel))
      return json({ accepted: false, reason: 'unselected_source' });
    hint = {
      event: {
        channel: event.channel,
        subtype: event.subtype,
        ts: event.ts,
        thread_ts: event.thread_ts,
        event_ts: event.event_ts,
        deleted_ts: event.deleted_ts,
        message: event.message
          ? { ts: event.message.ts, thread_ts: event.message.thread_ts }
          : undefined
      }
    };
  } else if (params.provider === 'github') {
    if (!resources.includes(data.repository?.full_name))
      return json({ accepted: false, reason: 'unselected_source' });
  }
  if (typeof eventId !== 'string' || !eventId || eventId.length > 200)
    error(400, 'Missing webhook event ID');
  const accepted = await store.recordWebhook(connection.id, eventId, hint);
  return json({ accepted }, { headers: { 'Cache-Control': 'no-store' } });
}
