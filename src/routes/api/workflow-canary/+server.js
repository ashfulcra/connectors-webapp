import { randomUUID } from 'node:crypto';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { start, getRun } from 'workflow/api';
import { workflowCanary } from '../../../../workflows/workflow-canary.js';
import { requireOwner } from '$lib/server/owner.js';
import { sameOrigin } from '$lib/server/runtime.js';
import { seal, unseal } from '$lib/server/secrets.js';
const cookieName = 'connectors_workflow_canary';
const context = () => `${env.CONNECTORS_DEPLOYMENT_ID}:${env.OWNER_USER_ID}:workflow-canary`;
const cryptoOptions = () => ({ key: env.CREDENTIAL_ENCRYPTION_KEY, keyId: env.CREDENTIAL_KEY_ID || 'v1' });
/** @type {import('./$types').RequestHandler} */
export async function POST({ cookies, request, url }) {
  await requireOwner(cookies);
  sameOrigin(request, url);
  const marker = randomUUID(), token = `connectors-workflow-canary:${marker}`;
  const runs = await Promise.all([start(workflowCanary, [token, marker]), start(workflowCanary, [token, marker])]);
  const runIds = runs.map(run => run.runId);
  const ticket = seal({ marker, runIds, expiresAt: Date.now() + 300000 }, context(), cryptoOptions());
  cookies.set(cookieName, Buffer.from(JSON.stringify(ticket)).toString('base64url'), { path: '/api/workflow-canary', httpOnly: true, secure: true, sameSite: 'strict', maxAge: 300 });
  return json({ marker, runIds }, { status: 202 });
}
/** @type {import('./$types').RequestHandler} */
export async function GET({ cookies, url }) {
  await requireOwner(cookies);
  const ids = url.searchParams.getAll('runId');
  if (ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => !/^wrun_[0-9A-HJKMNP-TV-Z]{26}$/.test(id))) error(400, 'Two canary run IDs required');
  let ticket;
  try {
    ticket = unseal(JSON.parse(Buffer.from(cookies.get(cookieName) || '', 'base64url').toString()), context(), cryptoOptions());
  } catch { error(403, 'Start a canary on this deployment first'); }
  if (ticket.expiresAt <= Date.now() || ids.some(id => !ticket.runIds.includes(id))) error(403, 'Canary ticket expired or mismatched');
  const runs = await Promise.all(ids.map(async id => {
    const run = getRun(id), status = await run.status;
    if (status !== 'completed') return { id, status };
    const value = await run.returnValue;
    if (!value || value.marker !== ticket.marker || !['winner','duplicate'].includes(value.kind)) error(502, 'Unexpected canary result');
    return { id, status, kind: value.kind, marker: value.marker, stampedAt: value.stampedAt, winnerRunId: value.winnerRunId };
  }));
  const winner = runs.find(run => run.kind === 'winner');
  const duplicate = runs.find(run => run.kind === 'duplicate');
  return json({ runs, passed: !!winner && !!duplicate && duplicate.winnerRunId === winner.id });
}
