import { createHook, sleep } from 'workflow';
/** @param {string} token @param {string} marker */
export async function workflowCanary(token, marker) {
  'use workflow';
  const hook = createHook({ token, experimental_minRetention: '5m' });
  const conflict = await hook.getConflict();
  if (conflict) return { kind: 'duplicate', marker, winnerRunId: conflict.runId };
  await sleep('2s');
  return await stamp(marker);
}
/** @param {string} marker */
async function stamp(marker) {
  'use step';
  return { kind: 'winner', marker, stampedAt: new Date().toISOString() };
}
