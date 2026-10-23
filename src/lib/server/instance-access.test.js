import { it, expect, vi } from 'vitest';
import { error } from '@sveltejs/kit';
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
import { instanceMode, personalAccess } from './instance-access.js';
/** @param {string} pathname @param {string} method */
const event = (pathname, method = 'GET') => ({
  url: new URL('https://private.example' + pathname),
  request: new Request('https://private.example' + pathname, { method }),
  cookies: { get: () => undefined }
});
it('defaults missing and invalid mode to personal; public mode requires explicit opt-in', () => {
  expect(instanceMode()).toBe('personal');
  expect(instanceMode('public')).toBe('personal');
  expect(instanceMode('public-template')).toBe('public-template');
});
it('allows only exact bootstrap/assets/machine-auth paths without owner lookup', async () => {
  const verifyOwner = vi.fn(async () => {
    error(401, 'missing');
  });
  for (const path of [
    '/login',
    '/api/auth/check',
    '/api/auth/device/code',
    '/_app/immutable/login.js',
    '/api/health',
    '/api/cron',
    '/api/webhooks/slack/id'
  ])
    expect(await personalAccess(event(path), { verifyOwner })).toBeUndefined();
  expect(verifyOwner).not.toHaveBeenCalled();
});
it('redirects unauthenticated page access but denies guide/API data reads', async () => {
  const verifyOwner = async () => {
    error(401, 'missing');
  };
  for (const path of ['/', '/app', '/harness', '/guide', '/api/auth/not-an-endpoint']) {
    await expect(personalAccess(event(path), { verifyOwner })).rejects.toMatchObject(
      path.startsWith('/api/') ? { status: 401 } : { status: 303, location: '/login' }
    );
  }
  for (const path of ['/guides/agent.md', '/api/setup', '/api/connections', '/app/__data.json']) {
    await expect(personalAccess(event(path), { verifyOwner })).rejects.toMatchObject(
      path.startsWith('/app') ? { status: 303 } : { status: 401 }
    );
  }
});
it('does not accept another valid user or identity outage as owner', async () => {
  for (const status of [403, 503])
    await expect(
      personalAccess(event('/app'), {
        verifyOwner: async () => {
          error(status, 'denied');
        }
      })
    ).rejects.toMatchObject({ status });
});
it('serves only explicitly supplied public landing assets and does not reveal private pages', async () => {
  const verifyOwner = vi.fn(async () => {
    error(401, 'missing');
  });
  const landing = { html: '<h1>Existing landing</h1>', agentBrief: '# Existing agent brief' };
  const root = await personalAccess(event('/'), { verifyOwner, landing });
  expect(await root?.text()).toBe(landing.html);
  const brief = await personalAccess(event('/agent.md'), { verifyOwner, landing });
  expect(await brief?.text()).toBe(landing.agentBrief);
  expect(verifyOwner).not.toHaveBeenCalled();
  await expect(
    personalAccess(event('/guides/agent.md'), { verifyOwner, landing })
  ).rejects.toMatchObject({ status: 401 });
});
it('allows verified owner through and routes default private root to workspace', async () => {
  const verifyOwner = async () => ({ userId: 'owner', accessToken: 'secret' });
  expect(await personalAccess(event('/app'), { verifyOwner })).toBeUndefined();
  await expect(personalAccess(event('/'), { verifyOwner })).rejects.toMatchObject({
    status: 303,
    location: '/app'
  });
});
it('admits only the generated queue flow path and keeps diagnostics/webhooks private', async () => {
  const verifyOwner = async () => { error(401, 'missing'); };
  expect(await personalAccess(event('/.well-known/workflow/v1/flow','POST'), { verifyOwner })).toBeUndefined();
  for (const path of ['/api/workflow-canary','/.well-known/workflow/v1/webhook/secret','/.well-known/workflow/v1/flow/other'])
    await expect(personalAccess(event(path,'POST'), { verifyOwner })).rejects.toMatchObject({status:path.startsWith('/api/')?401:303});
});
