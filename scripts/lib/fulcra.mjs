import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const endpoint = 'https://api.fulcradynamics.com';
export const cli = process.env.FULCRA_CLI || 'fulcra-api';
export const token = () => execFileSync(cli, ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const ownerId = () => JSON.parse(execFileSync(cli, ['user-info'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).userid;

export function parseResponse(text, contentType) {
  if (contentType?.includes('jsonl') || contentType?.includes('ndjson')) return text.split('\n').filter(x => x.trim()).map(x => JSON.parse(x));
  return JSON.parse(text);
}

export async function request(path, { method = 'GET', body, contentType = 'application/json' } = {}) {
  const response = await fetch(endpoint + path, { method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': contentType }, body, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Fulcra ${method} ${path.split('?')[0]} returned ${response.status}`);
  return response.status === 204 ? null : parseResponse(await response.text(), response.headers.get('content-type'));
}
export async function readState() {
  try { return JSON.parse(await readFile('.private/deployment.json', 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
export async function saveState(state) {
  await mkdir('.private', { recursive: true, mode: 0o700 });
  await writeFile('.private/deployment.json', JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}
export async function recordResults(dataType) {
  const q = `{__name__=${JSON.stringify(dataType)}}[7d]`;
  const result = await request(`/data/v1/records?q=${encodeURIComponent(q)}`);
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.records)) return result.records;
  throw new Error(`Unexpected record response shape: ${Object.keys(result ?? {}).join(',')}`);
}
export async function verifyRecord(dataType, id) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const found = (await recordResults(dataType)).find(x => x.id === id);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Readback pending for ${id}; preserve this intent and do not blindly resubmit`);
}
export async function uploadWorkspace(local, remote) {
  execFileSync(cli, ['file', 'upload', local, remote], { stdio: ['ignore', 'pipe', 'pipe'] });
  const destination = `.private/readback-${remote.split('/').at(-1)}`;
  execFileSync(cli, ['file', 'download', remote, destination], { stdio: ['ignore', 'pipe', 'pipe'] });
  if ((await readFile(local, 'utf8')) !== (await readFile(destination, 'utf8'))) throw new Error(`Workspace readback differs: ${remote}`);
}
