import { randomUUID } from 'node:crypto';

export function createRunEvent(fields) {
  for (const name of ['run_id', 'milestone_id', 'role', 'step', 'status', 'detail', 'evidence', 'revision']) {
    if (typeof fields[name] !== 'string' || !fields[name].trim()) throw new Error(`${name} is required`);
  }
  const now = new Date().toISOString();
  return { ...fields, id: randomUUID(), start_time: now, end_time: now, sources: ['com.fulcradynamics.connectors.harness.v1'] };
}

export async function ingestRunEvent(request, dataType, event) {
  if (!/^Event\/[0-9a-f-]{36}$/i.test(dataType)) throw new Error('Harness requires a v1 Event type');
  createRunEvent(event); // enforce the evidence contract before transport
  return request(`/ingest/v1/record/${encodeURIComponent(dataType)}?api_version=v1`, {
    method: 'POST', body: JSON.stringify(event) + '\n', contentType: 'application/x-jsonl'
  });
}
