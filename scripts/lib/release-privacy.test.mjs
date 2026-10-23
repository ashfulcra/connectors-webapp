import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const checker = resolve('scripts/check-release.mjs');
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'connectors-release-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    await mkdir(join(root, 'src/lib/server'), { recursive: true });
    await writeFile(
      join(root, 'src/lib/server/public-guides.js'),
      'export const publicGuides = {};\n'
    );
    await writeFile(join(root, 'README.md'), '# Synthetic public example\n');
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const check = (root) => spawnSync(process.execPath, [checker, root], { encoding: 'utf8' });
test('a clean staged source tree passes and an accidentally tracked environment file is rejected', async () =>
  fixture(async (root) => {
    execFileSync('git', ['-C', root, 'add', '.']);
    assert.equal(check(root).status, 0);
    await writeFile(join(root, '.env'), 'SYNTHETIC=not-a-real-credential\n');
    execFileSync('git', ['-C', root, 'add', '.env']);
    const result = check(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /private\/generated/);
  }));
test('a meeting URL in staged content blocks publication without printing its content', async () =>
  fixture(async (root) => {
    const url = ['https:', '', 'otter.ai', 'u', 'synthetic-private-meeting'].join('/');
    await writeFile(join(root, 'notes.md'), url);
    execFileSync('git', ['-C', root, 'add', '.']);
    const result = check(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /marker/);
    assert.ok(!result.stderr.includes(url));
  }));
test('broken internal documentation links block publication', async () =>
  fixture(async (root) => {
    await writeFile(join(root, 'README.md'), 'Read [missing instructions](missing.md).\n');
    execFileSync('git', ['-C', root, 'add', '.']);
    const result = check(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /broken internal link/);
  }));
