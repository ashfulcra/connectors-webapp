import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, open, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const authority = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.headers.authorization === 'Bearer owner')
    res.end(JSON.stringify({ userid: 'test-owner' }));
  else if (req.headers.authorization === 'Bearer other')
    res.end(JSON.stringify({ userid: 'another-user' }));
  else {
    res.statusCode = req.headers.authorization === 'Bearer down' ? 503 : 401;
    res.end('{}');
  }
});
await new Promise((resolve) => authority.listen(0, '127.0.0.1', resolve));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
await mkdir('.private', { recursive: true, mode: 0o700 });
const log = await open(`.private/personal-http-${port}.log`, 'w', 0o600);
const child = spawn(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    env: {
      ...process.env,
      CONNECTORS_MODE: 'personal',
      PUBLIC_FULCRA_API_ENDPOINT: `http://127.0.0.1:${authority.address().port}/`,
      OWNER_USER_ID: 'test-owner',
      DATABASE_URL: ''
    },
    stdio: ['ignore', log.fd, log.fd],
    detached: true
  }
);
const keepLanding = process.argv.includes('--public-landing');
const base = `http://127.0.0.1:${port}`;
const evidence = { time: new Date().toISOString(), checks: [] };
try {
  let ready = false;
  for (let n = 0; n < 70; n++) {
    assert.equal(child.exitCode, null);
    try {
      if ((await fetch(base + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready);
  for (const path of [
    '/',
    '/app',
    '/harness',
    '/guide',
    '/guides/agent.md',
    '/api/setup',
    '/api/connections'
  ]) {
    for (const session of ['', 'forged', 'other', 'down']) {
      const r = await fetch(base + path, {
        redirect: 'manual',
        headers: session ? { Cookie: 'fulcra_access_token=' + session } : {}
      });
      const data = path.startsWith('/api/') || path.startsWith('/guides/');
      const expected =
        path === '/' && keepLanding
          ? 200
          : session === 'other'
            ? 403
            : session === 'down'
              ? 503
              : data
                ? 401
                : 303;
      assert.equal(r.status, expected, `${path} ${session || 'absent'}`);
      if (expected === 303) assert.equal(r.headers.get('location'), '/login');
      if (path === '/' && keepLanding)
        assert.equal(
          await r.text(),
          await readFile('src/lib/server/personal/landing.html', 'utf8')
        );
      evidence.checks.push({ path, session: session || 'absent', status: r.status });
    }
  }
  const login = await fetch(base + '/login');
  assert.equal(login.status, 200);
  const html = await login.text();
  assert.ok(html.includes('Sign in with Fulcra'));
  for (const text of ['Your tools.', 'Granola', 'Asana', 'Create Account', 'About this template'])
    assert.ok(!html.includes(text), text);
  assert.equal(
    (await fetch(base + '/app', { headers: { Cookie: 'fulcra_access_token=owner' } })).status,
    200
  );
  const root = await fetch(base + '/', {
    redirect: 'manual',
    headers: { Cookie: 'fulcra_access_token=owner' }
  });
  if (keepLanding) {
    assert.equal(root.status, 200);
    assert.equal(await root.text(), await readFile('src/lib/server/personal/landing.html', 'utf8'));
    for (const session of ['', 'forged', 'other', 'down', 'owner']) {
      const brief = await fetch(base + '/agent.md', {
        headers: session ? { Cookie: 'fulcra_access_token=' + session } : {}
      });
      assert.equal(brief.status, 200);
      assert.equal(await brief.text(), await readFile('src/lib/server/personal/agent.md', 'utf8'));
    }
  } else {
    assert.equal(root.status, 303);
    assert.equal(root.headers.get('location'), '/app');
  }
  for (const path of ['/app/__data.json', '/harness/__data.json']) {
    const response = await fetch(base + path, { redirect: 'manual' });
    if (response.status === 200) {
      const body = await response.json();
      assert.equal(body.type, 'redirect');
      assert.equal(body.location, '/login');
    } else assert.equal(response.status, 303);
  }

  assert.equal(
    (await fetch(base + '/guides/agent.md', { headers: { Cookie: 'fulcra_access_token=owner' } }))
      .status,
    200
  );
  const privateGuide = await fetch(base + '/guides/agent.md', {
    headers: { Cookie: 'fulcra_access_token=owner' }
  });
  assert.equal(privateGuide.headers.get('cache-control'), 'private, no-store');
  assert.equal((await fetch(base + '/api/cron')).status, 401);
  await writeFile('.private/personal-http-evaluation.json', JSON.stringify(evidence, null, 2), {
    mode: 0o600
  });
  console.log(
    'Personal HTTP checks pass:28 denied page/data requests; minimal login; owner app/guides; root redirect; scheduler denied.'
  );
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    process.kill(-child.pid, 'SIGTERM');
    await exited;
  }
  await log.close();
  await new Promise((resolve) => authority.close(resolve));
}
