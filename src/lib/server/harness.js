/** @param {any[]} records */
export function normalizeRunEvents(records) {
  const fields = ['id','run_id','milestone_id','role','step','status','detail','evidence','revision','start_time'];
  const events = records.filter(record => fields.every(field => typeof record[field] === 'string' && record[field].trim()) && Number.isFinite(Date.parse(record.start_time)));
  return { events, invalidCount: records.length - events.length };
}
/** @param {import('./fulcra').FulcraClient} client @param {string} dataType @param {string} range */
export async function listRunEvents(client, dataType, range = '7d') {
  if (!/^Event\/[0-9a-f-]{36}$/i.test(dataType)) throw new Error('A v1 Event harness type is required');
  return normalizeRunEvents(await client.readRecords(dataType, range));
}
/** @param {import('./fulcra').FulcraClient} client @param {string} path */
export async function readWorkspaceText(client, path) { return client.readFile(path); }
