import { it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyGranola } from './webhook-signatures.js';
it('verifies Granola raw bytes, rejects tamper and stale delivery', () => {
  const timestamp = String(Math.floor(Date.now() / 1000)),
    body = '{"event_id":"event"}',
    secret = Buffer.from('secret').toString('base64');
  const sig = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update('event.' + timestamp + '.' + body)
    .digest('base64');
  const headers = new Headers({
    'webhook-id': 'event',
    'webhook-timestamp': timestamp,
    'webhook-signature': 'v1,' + sig
  });
  expect(verifyGranola(body, headers, 'whsec_' + secret)).toBe('event');
  expect(() => verifyGranola(body + ' ', headers, 'whsec_' + secret)).toThrow();
  headers.set('webhook-timestamp', '100');
  expect(() => verifyGranola(body, headers, 'whsec_' + secret)).toThrow();
});
it('verifies GitHub SHA256 raw-body signatures and rejects a changed body', async () => {
  const { verifyGitHub } = await import('./webhook-signatures.js');
  const body = '{"repository":{"full_name":"example/repo"}}';
  const headers = new Headers({
    'x-github-delivery': 'delivery',
    'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex')
  });
  expect(verifyGitHub(body, headers, 'secret')).toBe('delivery');
  expect(() => verifyGitHub(body + ' ', headers, 'secret')).toThrow();
});
it('verifies Slack timestamp/raw body signatures and rejects replay', async () => {
  const { verifySlack } = await import('./webhook-signatures.js');
  const body = '{"event_id":"event"}',
    timestamp = String(Math.floor(Date.now() / 1000));
  const headers = new Headers({
    'x-slack-request-timestamp': timestamp,
    'x-slack-signature':
      'v0=' +
      createHmac('sha256', 'secret')
        .update('v0:' + timestamp + ':' + body)
        .digest('hex')
  });
  expect(verifySlack(body, headers, 'secret')).toBe(true);
  headers.set('x-slack-request-timestamp', '100');
  expect(() => verifySlack(body, headers, 'secret')).toThrow();
});
