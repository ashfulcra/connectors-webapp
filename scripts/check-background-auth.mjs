// Local synthetic UI acceptance. Optional driver: npm install --no-save --package-lock=false playwright
// No provider, Fulcra, production credentials, or production writes are used.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, open, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const authority = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ userid: 'walkthrough-owner' }));
});
await new Promise((r) => authority.listen(0, '127.0.0.1', r));
const probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
await mkdir('.private', { recursive: true, mode: 0o700 });
const log = await open('.private/background-auth-server.log', 'w', 0o600);
const child = spawn(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    env: {
      ...process.env,
      CONNECTORS_MODE: 'personal',
      CONNECTORS_BACKEND: 'postgres',
      DATABASE_URL: '',
      OWNER_USER_ID: 'walkthrough-owner',
      PUBLIC_AUTH0_DOMAIN: 'background-test.auth0.com',
      PUBLIC_FULCRA_API_ENDPOINT: `http://127.0.0.1:${authority.address().port}/`
    },
    stdio: ['ignore', log.fd, log.fd],
    detached: true
  }
);
let browser;
const base = `http://127.0.0.1:${port}`,
  evidence = { providerInstructions: [], configuration: null };
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, 'test app starts');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {})
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addCookies([{ name: 'fulcra_access_token', value: 'synthetic-owner', url: base }]);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let approved = false,
    polls = 0,
    starts = 0,
    mode = 'pending',
    startResponded = false,
    returnedInterval = 1;
  const enrollment = {
    enrollmentId: '11111111-1111-4111-8111-111111111111',
    userCode: 'TEST-CODE',
    verificationUri: 'https://background-test.auth0.com/verify',
    interval: 1,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  };
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === '/api/auth/check') body = { authenticated: true };
    else if (path === '/api/auth/user') body = { 'fulcradynamics.com/userid': 'walkthrough-owner' };
    else if (path === '/api/harness/owner') body = { isOwner: true };
    else if (path === '/api/user/info') body = { userid: 'walkthrough-owner' };
    else if (path === '/api/setup')
      body = { ready: true, backgroundStatus: approved ? 'ready' : 'required_configuration' };
    else if (path === '/api/connections') body = { connections: [] };
    else if (path === '/api/background-auth/start') {
      starts++;
      await new Promise((r) => setTimeout(r, 500));
      startResponded = true;
      body = enrollment;
    } else if (path === '/api/background-auth/complete') {
      polls++;
      if (mode === 'ready') approved = true;
      body = { status: mode, interval: returnedInterval };
    } else {
      errors.push(path);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.route('https://background-test.auth0.com/verify', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Approve test access</h1>' })
  );
  await page.goto(base + '/app');
  await page.getByRole('button', { name: 'Allow automatic sync', exact: true }).waitFor();
  const popupPromise = page.waitForEvent('popup', { timeout: 7000 });
  await page.getByRole('button', { name: 'Allow automatic sync', exact: true }).click();
  const popup = await popupPromise;
  assert.equal(startResponded, false, 'popup opens before the asynchronous start response');
  await popup.waitForURL('https://background-test.auth0.com/verify');
  await page.getByText('TEST-CODE', { exact: true }).waitFor();
  await page.waitForTimeout(1400);
  assert.ok(polls > 0, 'pending enrollment is checked automatically');
  await page.reload();
  await page.getByText('TEST-CODE', { exact: true }).waitFor();
  assert.equal(starts, 1, 'reload resumes the existing enrollment');
  mode = 'ready';
  await page.getByText('Background access ready for all connectors', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Disconnect background access', exact: true }).waitFor();
  assert.equal(await page.getByText('TEST-CODE', { exact: true }).count(), 0);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem('fulcra.connector.background-enrollment')),
    null
  );
  // A reloaded page cannot own the old popup handle; readiness is still reflected.
  await popup.close();
  approved = false;
  ((mode = 'pending'), (startResponded = false), (returnedInterval = 1));
  polls = 0;
  await page.reload();
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole('button', { name: 'Allow automatic sync', exact: true }).click();
  await page.getByRole('link', { name: 'Open Fulcra verification ↗', exact: true }).waitFor();
  await page.getByText(/popup.*blocked/i).waitFor();
  mode = 'wrong_account';
  await page.getByText(/different Fulcra account/i).waitFor();
  assert.equal(await page.getByText('TEST-CODE', { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole('button', { name: 'Allow automatic sync', exact: true }).count(),
    1
  );
  // Successful approval closes the popup while this page still owns the handle.
  mode = 'ready';
  await page.reload();
  const nextPopup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Allow automatic sync', exact: true }).click();
  const closing = await nextPopup;
  await page.getByText('Background access ready for all connectors', { exact: true }).waitFor();
  assert.equal(closing.isClosed(), true);
  // Reload with an expired nonsecret reference: no OAuth exchange, clear restart state.
  approved = false;
  mode = 'pending';
  polls = 0;
  await page.evaluate(
    (value) =>
      sessionStorage.setItem('fulcra.connector.background-enrollment', JSON.stringify(value)),
    { ...enrollment, expiresAt: new Date(0).toISOString() }
  );
  await page.reload();
  await page.getByText(/Authorization expired/).waitFor();
  assert.equal(polls, 0);
  // Honor increased polling intervals; never issue concurrent checks.
  enrollment.expiresAt = new Date(Date.now() + 60000).toISOString();
  returnedInterval = 3;
  const slowerPopup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Allow automatic sync', exact: true }).click();
  const slower = await slowerPopup;
  await page.waitForTimeout(1900);
  assert.equal(polls, 1);
  await page.waitForTimeout(1300);
  assert.equal(polls, 1, 'server slow-down interval honored');
  const popupClosed = slower.waitForEvent('close', { timeout: 7000 });
  await page.getByRole('link', { name: 'User guide', exact: true }).click();
  await page.waitForURL(base + '/guide');
  await popupClosed;
  assert.equal(slower.isClosed(), true);
  const stopped = polls;
  await page.waitForTimeout(3300);
  assert.equal(polls, stopped, 'unmount stops polling');
  assert.deepEqual(errors, []);
  await writeFile(
    '.private/background-auth-browser.json',
    JSON.stringify(
      {
        popup: true,
        autoPoll: true,
        reloadResume: true,
        blockedFallback: true,
        wrongAccount: true,
        readyClosesPopup: true,
        starts,
        polls
      },
      null,
      2
    )
  );
  console.log('Background authorization browser checks passed');
} finally {
  await browser?.close();
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  await new Promise((r) => authority.close(r));
  await log.close();
}
