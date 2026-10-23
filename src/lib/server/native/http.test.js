import { it, expect, vi } from 'vitest';
const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({
  env: {
    CONNECTORS_BACKEND: 'workflow',
    CONNECTORS_DEPLOYMENT_ID: 'test',
    OWNER_USER_ID: 'owner',
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
  }
}));
vi.mock('$env/dynamic/public', () => ({
  env: { PUBLIC_FULCRA_API_ENDPOINT: 'https://api.example/' }
}));
vi.mock('../owner.js', () => ({
  requireOwner: async () => ({ userId: 'owner', accessToken: 'token' })
}));
vi.mock('workflow/api', () => ({
  start,
  getRun: vi.fn(),
  getHookByToken: vi.fn(async () => {
    throw Error('missing');
  })
}));
vi.mock('../fulcra.js', () => ({
  FulcraClient: class {
    async readFile() {
      return '';
    }
  }
}));
import { nativeHTTP } from './http.js';
it('missing marker on ordinary setup fails closed without starting an empty controller', async () => {
  const request = new Request('https://app.example/api/setup');
  await expect(
    nativeHTTP({ request, url: new URL(request.url), cookies: {} })
  ).rejects.toMatchObject({ status: 503 });
  expect(start).not.toHaveBeenCalled();
});
it('does not expose stale-snapshot canary cancellation', async () => {
  const request = new Request('https://app.example/api/native/canary/stop', { method: 'POST' });
  expect(await nativeHTTP({ request, url: new URL(request.url), cookies: {} })).toBeUndefined();
  expect(start).not.toHaveBeenCalled();
});
