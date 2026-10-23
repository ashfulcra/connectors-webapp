import { spawn } from 'node:child_process';
import { readFile, writeFile, open } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createStore } from '../src/lib/server/store.js';
import { seal } from '../src/lib/server/secrets.js';
import { token, ownerId } from './lib/fulcra.mjs';
const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  JSON.parse(await readFile('.private/postgres-test.json', 'utf8')).url;
const values = parseEnv(await readFile('.env', 'utf8')),
  deploymentId = randomUUID(),
  owner = ownerId(),
  crypto = { key: randomBytes(32).toString('base64'), keyId: 'http-test' };
const pool = new Pool({ connectionString: databaseUrl });
await pool.query(await readFile('migrations/001-operational.sql', 'utf8'));
const store = createStore({ pool, deploymentId, ownerId: owner, crypto });
await store.initialize();
const c = await store.createConnection({
  connector: 'github',
  label: 'Synthetic HTTP test',
  accountId: 'fixture',
  config: {}
});
await store.saveGrant('provider:' + c.id, {
  encrypted: seal(
    { token: 'fixture-never-sent' },
    `${deploymentId}:${owner}:provider:${c.id}`,
    crypto
  ),
  status: 'ready'
});
const log = await open('.private/setup-http-server.log', 'w', 0o600);
const child = spawn(
  'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '6174', '--strictPort'],
  {
    env: {
      ...process.env,
      ...values,
      DATABASE_URL: databaseUrl,
      CONNECTORS_DEPLOYMENT_ID: deploymentId,
      OWNER_USER_ID: owner,
      CREDENTIAL_ENCRYPTION_KEY: crypto.key,
      CREDENTIAL_KEY_ID: crypto.keyId,
      CRON_SECRET: 'http-test-only'
    },
    stdio: ['ignore', log.fd, log.fd],
    detached: true
  }
);
const base = 'http://127.0.0.1:6174',
  cookie = 'fulcra_access_token=' + token(),
  evidence = { time: new Date().toISOString(), checks: [] };
try {
  let listening = false;
  for (let n = 0; n < 50; n++) {
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) {
        listening = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(listening, 'test server not ready');
  for (const path of ['/api/setup', '/api/connections', `/api/connections/${c.id}`]) {
    const absent = await fetch(base + path);
    assert.equal(absent.status, 401);
    const forged = await fetch(base + path, { headers: { Cookie: 'fulcra_access_token=forged' } });
    assert.equal(forged.status, 401);
    const response = await fetch(base + path, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('fixture-never-sent'));
    assert.ok(!text.includes('ciphertext'));
    evidence.checks.push({ path, owner: 200, absent: 401, forged: 401, secretsAbsent: true });
  }
  const cross = await fetch(base + `/api/connections/${c.id}/action`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://foreign.example',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'pause' })
  });
  assert.equal(cross.status, 403);
  for (const action of ['pause', 'disconnect']) {
    const response = await fetch(base + `/api/connections/${c.id}/action`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    assert.equal(response.status, 200);
  }
  assert.equal((await store.getConnection(c.id)).status, 'disconnected');
  assert.equal(await store.getGrant('provider:' + c.id), null);
  const page = await fetch(base + '/app', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const text of ['Granola', 'Asana', 'GitHub', 'Notion', 'Slack', 'Background sync'])
    assert.ok(html.includes(text), text);
  evidence.crossOrigin = 403;
  evidence.pauseDisconnect = true;
  evidence.ownerWorkspaceSSR = true;
  await writeFile('.private/setup-http-evaluation.json', JSON.stringify(evidence, null, 2), {
    mode: 0o600
  });
  console.log(JSON.stringify(evidence));
} finally {
  if (child.pid)
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  await pool.end();
  await log.close();
}
