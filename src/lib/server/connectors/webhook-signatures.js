import { createHmac, timingSafeEqual } from 'node:crypto';
/** @param {string} actual @param {string} expected */
function equal(actual, expected) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** @param {string|null} timestamp */
function fresh(timestamp) {
  if (
    !timestamp ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^\d+$/.test(timestamp)
  )
    throw new Error('Stale webhook');
}
/** @param {string} body @param {Headers} headers @param {string} secret */
export function verifyGranola(body, headers, secret) {
  const id = headers.get('webhook-id'),
    timestamp = headers.get('webhook-timestamp');
  fresh(timestamp);
  if (!id || !secret.startsWith('whsec_')) throw new Error('Invalid webhook');
  const expected = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  if (!(headers.get('webhook-signature') ?? '').split(' ').some((s) => equal(s, 'v1,' + expected)))
    throw new Error('Invalid webhook');
  return id;
}
/** GitHub has no signed timestamp; durable delivery-ID dedupe is required.
 * @param {string} body @param {Headers} headers @param {string} secret */
export function verifyGitHub(body, headers, secret) {
  const id = headers.get('x-github-delivery');
  if (!id || !secret) throw new Error('Invalid webhook');
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  if (!equal(headers.get('x-hub-signature-256') ?? '', expected))
    throw new Error('Invalid webhook');
  return id;
}
/** @param {string} body @param {Headers} headers @param {string} secret */
export function verifySlack(body, headers, secret) {
  const timestamp = headers.get('x-slack-request-timestamp');
  fresh(timestamp);
  if (!secret) throw new Error('Invalid webhook');
  const expected =
    'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex');
  if (!equal(headers.get('x-slack-signature') ?? '', expected)) throw new Error('Invalid webhook');
  return true;
}
