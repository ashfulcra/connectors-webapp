import { timingSafeEqual } from 'node:crypto';
/** @param {Headers} headers @param {string|undefined} secret */
export function authorizeCron(headers, secret) {
  if (!secret) throw new Error('Cron is not configured');
  const actual = Buffer.from(headers.get('authorization') ?? ''),
    expected = Buffer.from('Bearer ' + secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('Unauthorized cron request');
  return true;
}
