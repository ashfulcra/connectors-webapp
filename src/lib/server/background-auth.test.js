import { it, expect, vi, beforeEach } from 'vitest';
import { seal, unseal } from './secrets.js';
const mocks = vi.hoisted(() => ({ requireOwner: vi.fn(), runtime: vi.fn(), sameOrigin: vi.fn() }));
vi.mock('$lib/server/owner', () => ({ requireOwner: mocks.requireOwner }));
vi.mock('$lib/server/runtime', () => ({ runtime: mocks.runtime, sameOrigin: mocks.sameOrigin }));
vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_AUTH0_DOMAIN: 'example.auth0.com',
    PUBLIC_AUTH0_CLIENT_ID: 'public-client',
    PUBLIC_FULCRA_API_ENDPOINT: 'https://api.fulcradynamics.com/'
  }
}));
import { POST as start } from '../../routes/api/background-auth/start/+server.js';
import { POST as complete } from '../../routes/api/background-auth/complete/+server.js';
const crypto = { key: Buffer.alloc(32, 7).toString('base64'), keyId: 'test' };
const saved = vi.fn();
const store = {
  deploymentId: 'deployment',
  ownerId: 'owner',
  saveGrant: saved,
  getGrant: vi.fn(),
  withGrantLock: vi.fn()
};
/** @param {any} body */
const event = (body) =>
  /** @type {any} */ ({
    cookies: {},
    url: new URL('https://app.example/api/background-auth'),
    request: new Request('https://app.example/api/background-auth', {
      method: 'POST',
      headers: { Origin: 'https://app.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue({ userId: 'owner' });
  mocks.runtime.mockReturnValue({ store, crypto });
});
it('never returns device secrets from enrollment and stores them encrypted', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        device_code: 'private-device',
        user_code: 'ABCD',
        verification_uri: 'https://example/activate',
        expires_in: 600,
        interval: 5
      })
    )
  );
  const response = await start(event({}));
  const data = await response.json();
  expect(JSON.stringify(data)).not.toContain('private-device');
  const [key, grant] = saved.mock.calls[0];
  expect(unseal(grant.encrypted, `deployment:owner:${key}`, crypto).deviceCode).toBe(
    'private-device'
  );
});
it('refuses a background grant belonging to another Fulcra account', async () => {
  const id = '11111111-1111-4111-8111-111111111111',
    key = 'enrollment:' + id;
  store.withGrantLock.mockImplementation(async (_key, fn) =>
    fn(
      {
        status: 'pending',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        encrypted: seal(
          { deviceCode: 'secret', interval: 1, lastPoll: 0 },
          `deployment:owner:${key}`,
          crypto
        )
      },
      {}
    )
  );
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'private-access',
          refresh_token: 'private-refresh',
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(Response.json({ userid: 'other' }))
  );
  const response = await complete(event({ enrollmentId: id }));
  expect(await response.json()).toEqual({ status: 'wrong_account' });
  expect(saved).not.toHaveBeenCalled();
});
it('enrollment is owner gated before credential or provider access', async () => {
  mocks.requireOwner.mockRejectedValue({ status: 403 });
  await expect(start(event({}))).rejects.toMatchObject({ status: 403 });
  expect(mocks.runtime).not.toHaveBeenCalled();
});

it('completed enrollment can be checked again without exchanging its device code', async () => {
  store.withGrantLock.mockImplementation(async (_key, fn) =>
    fn({ status: 'complete', expiresAt: new Date(0).toISOString() }, {})
  );
  store.getGrant.mockResolvedValue({ status: 'ready' });
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  const response = await complete(event({ enrollmentId: '11111111-1111-4111-8111-111111111111' }));
  expect(await response.json()).toEqual({ status: 'ready' });
  expect(network).not.toHaveBeenCalled();
});
it('completed enrollment does not revive disconnected access', async () => {
  store.withGrantLock.mockImplementation(async (_key, fn) => fn({ status: 'complete' }, {}));
  store.getGrant.mockResolvedValue({ status: 'disconnected' });
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  const response = await complete(event({ enrollmentId: '11111111-1111-4111-8111-111111111111' }));
  expect(await response.json()).toEqual({ status: 'reauthorize' });
  expect(network).not.toHaveBeenCalled();
});
it('saves owner-approved access in native state and keeps it on a second completion', async () => {
  const { freshState, nativeStore } = await import('./native/state.js');
  const state = freshState('deployment', 'owner');
  const native = nativeStore(state);
  const id = '11111111-1111-4111-8111-111111111111',
    key = 'enrollment:' + id;
  await native.saveGrant(key, {
    status: 'pending',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    encrypted: seal(
      { deviceCode: 'private-device', interval: 1, lastPoll: 0 },
      `deployment:owner:${key}`,
      crypto
    )
  });
  mocks.runtime.mockReturnValue({ store: native, crypto });
  const network = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'private-access',
        refresh_token: 'private-refresh',
        expires_in: 3600
      })
    )
    .mockResolvedValueOnce(Response.json({ userid: 'owner' }));
  vi.stubGlobal('fetch', network);
  expect(await (await complete(event({ enrollmentId: id }))).json()).toEqual({ status: 'ready' });
  expect(state.grants[key].status).toBe('complete');
  expect(
    unseal(state.grants.fulcra.encrypted, 'deployment:owner:fulcra', crypto).refresh_token
  ).toBe('private-refresh');
  expect(await (await complete(event({ enrollmentId: id }))).json()).toEqual({ status: 'ready' });
  expect(network).toHaveBeenCalledTimes(2);
});
