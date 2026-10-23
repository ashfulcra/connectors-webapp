import { providerHTTP, rateAware, selectedResources } from './http.js';
const fields =
  'gid,name,notes,modified_at,created_at,completed,due_on,permalink_url,memberships.project.gid';
/** @param {{fetchImpl?:typeof fetch}} options */
export function createAsana({ fetchImpl = fetch } = {}) {
  /** @param {any} credential @param {number} deadline */
  const http = (credential, deadline) =>
    providerHTTP({ base: 'https://app.asana.com/api/1.0/', credential, fetchImpl, deadline });
  /** @param {any} input */
  async function listResources({ credential, cursor = null, deadline = Date.now() + 10000 }) {
    const q = new URLSearchParams({ limit: '100', archived: 'false' });
    if (credential.workspaceId) q.set('workspace', credential.workspaceId);
    if (cursor) q.set('offset', cursor);
    const { data } = await http(credential, deadline)('projects?' + q);
    return {
      resources: data.data.map((/** @type {any} */ p) => ({
        id: p.gid,
        name: p.name,
        kind: 'project'
      })),
      nextCursor: data.next_page?.offset ?? null
    };
  }
  /** @param {any} task */
  const normalized = (task) => ({
    id: task.gid,
    version: task.modified_at,
    timestamp: task.modified_at,
    operation: 'upsert',
    payload: task,
    files: [
      {
        name: 'task.md',
        content: `# ${task.name}\n\n${task.notes ?? ''}\n\n${task.permalink_url ?? ''}`,
        contentType: 'text/markdown'
      }
    ]
  });
  /** @param {any} input */
  async function readPage({ connection, credential, checkpoint, deadline }) {
    return rateAware(async () => {
      const resources = selectedResources(connection),
        cp = structuredClone(checkpoint ?? { index: 0, projects: {} });
      cp.projects ??= {};
      const project = resources[(cp.index ?? 0) % resources.length],
        state = cp.projects[project] ?? {},
        req = http(credential, deadline);
      const changes = [];
      if (!state.phase || Date.now() - Date.parse(state.reconciledAt ?? 0) > 86400000) {
        const { data } = await req(
          'events?' + new URLSearchParams({ resource: project }),
          {},
          [412]
        );
        if (!data.sync) throw new Error('Missing Asana bootstrap token');
        state.sync = data.sync;
        state.phase = 'snapshot';
        state.reconciledAt = new Date().toISOString();
        state.offset = null;
        state.queue = [];
      }
      let more = false;
      if (state.phase === 'snapshot') {
        const q = new URLSearchParams({
          limit: '20',
          opt_fields: fields,
          completed_since: connection.config.backfillSince
        });
        if (state.offset) q.set('offset', state.offset);
        const { data } = await req(`projects/${encodeURIComponent(project)}/tasks?${q}`);
        changes.push(...data.data.map(normalized));
        state.offset = data.next_page?.offset ?? null;
        more = !!state.offset;
        if (!more) {
          state.phase = 'events';
          more = true;
        }
      } else {
        if (!state.queue?.length) {
          const response = await req(
            'events?' + new URLSearchParams({ resource: project, sync: state.sync }),
            {},
            [412]
          );
          if (response.status === 412) return { changes: [], resetRequired: true };
          state.queue = response.data.data ?? [];
          state.nextSync = response.data.sync;
          state.hasMore = response.data.has_more ?? false;
        }
        const batch = state.queue.splice(0, 5);
        for (const event of batch) {
          if (event.resource?.resource_type !== 'task') continue;
          const id = event.resource.gid,
            timestamp = event.created_at;
          if (event.action === 'removed' || event.action === 'deleted') {
            changes.push({
              id,
              version: timestamp + ':' + event.action,
              timestamp,
              operation: event.action,
              payload: { id, project_id: project, status: event.action }
            });
            continue;
          }
          const { data, status } = await req(
            `tasks/${encodeURIComponent(id)}?opt_fields=${fields}`,
            {},
            [404]
          );
          if (status === 404) {
            changes.push({
              id,
              version: timestamp + ':unavailable',
              timestamp,
              operation: 'access_lost',
              payload: { id, project_id: project, status: 'unavailable' }
            });
            continue;
          }
          if (data.data.memberships?.some((/** @type {any} */ m) => m.project.gid === project))
            changes.push(normalized(data.data));
        }
        if (!state.queue.length) {
          state.sync = state.nextSync;
          state.nextSync = null;
          more = state.hasMore;
        } else more = true;
      }
      cp.projects[project] = state;
      if (!more) cp.index = ((cp.index ?? 0) + 1) % resources.length;
      return { changes, candidateCheckpoint: cp, continuation: more || cp.index !== 0 };
    });
  }
  return {
    listResources,
    readPage,
    validate: async (/** @type {any} */ credential) => {
      const { data } = await http(credential, Date.now() + 10000)('users/me');
      return { accountId: data.data.gid };
    }
  };
}
export const asana = createAsana();
