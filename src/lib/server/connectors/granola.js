import { providerHTTP, rateAware, selectedResources } from './http.js';
/** @param {{fetchImpl?:typeof fetch}} options */
export function createGranola({ fetchImpl = fetch } = {}) {
  const base = 'https://public-api.granola.ai/';
  /** @param {any} credential @param {number} deadline */
  const http = (credential, deadline) => providerHTTP({ base, credential, fetchImpl, deadline });
  /** @param {any} input */
  async function listResources({ credential, cursor = null, deadline = Date.now() + 10000 }) {
    const { data } = await http(
      credential,
      deadline
    )('v1/folders?page_size=30' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    return {
      resources: data.folders.map((/** @type {any} */ f) => ({
        id: f.id,
        name: f.name,
        kind: 'folder',
        parentId: f.parent_folder_id
      })),
      nextCursor: data.hasMore ? data.cursor : null
    };
  }
  /** @param {any} input */
  async function readPage({ connection, credential, checkpoint, deadline }) {
    return rateAware(async () => {
      const resources = selectedResources(connection),
        cp = structuredClone(checkpoint ?? {}),
        index = cp.index ?? 0,
        folder = resources[index % resources.length];
      const req = http(credential, deadline);
      const delayed = (cp.delayed ?? []).map((/** @type {any} */ entry) =>
        typeof entry === 'string' ? { id: entry, folder } : entry
      );
      const cycleStart = cp.cycleStart ?? new Date().toISOString();
      /** @type {any} */
      let note;
      let listing,
        transcriptState = cp.transcript,
        rechecking = cp.transcript?.rechecking ?? false;
      if (transcriptState) {
        note = transcriptState.note;
      } else {
        const delayedIndex = delayed.findIndex(
          (/** @type {any} */ entry) => entry.folder === folder
        );
        const recheck = delayedIndex >= 0 && !cp.cursor && cp.recheck;
        if (recheck) {
          rechecking = true;
          const { id } = delayed.splice(delayedIndex, 1)[0];
          const detail = await req(
            `v1/notes/${encodeURIComponent(id)}?include=transcript`,
            {},
            [404, 413]
          );
          if (detail.status === 413) {
            note = (await req(`v1/notes/${encodeURIComponent(id)}`)).data;
            transcriptState = { note, cursor: null };
          } else note = detail.data;
        } else {
          const since = new Date(
            Date.parse(cp.since ?? connection.config.backfillSince) - 120000
          ).toISOString();
          const query = new URLSearchParams({
            folder_id: folder,
            updated_after: since,
            page_size: '1'
          });
          if (cp.cursor) query.set('cursor', cp.cursor);
          listing = (await req('v1/notes?' + query)).data;
          const summary = listing.notes[0];
          if (summary) {
            const detail = await req(
              `v1/notes/${encodeURIComponent(summary.id)}?include=transcript`,
              {},
              [413, 404]
            );
            if (detail.status === 413) {
              note = (await req(`v1/notes/${encodeURIComponent(summary.id)}`)).data;
              transcriptState = { note, cursor: null };
            } else if (detail.status === 404)
              note = {
                ...summary,
                deleted_at: summary.updated_at,
                folder_membership: [{ id: folder }]
              };
            else note = detail.data;
          }
        }
      }
      const paginated = !!transcriptState;
      if (note) {
        note = Object.fromEntries(
          [
            'id',
            'title',
            'updated_at',
            'created_at',
            'folder_membership',
            'summary_markdown',
            'summary_text',
            'transcript',
            'deleted_at',
            'web_url'
          ]
            .filter((k) => note[k] !== undefined)
            .map((k) => [k, note[k]])
        );
        if (transcriptState) transcriptState.note = note;
      }
      const changes = [];
      const belongs = note?.folder_membership?.some(
        (/** @type {any} */ f) =>
          f.id.toLowerCase() === folder.toLowerCase() ||
          f.parent_folder_id?.toLowerCase() === folder.toLowerCase()
      );
      if (note && belongs) {
        let transcript = note.transcript ?? null;
        if (transcriptState) {
          const query = new URLSearchParams({ page_size: '100' });
          if (transcriptState.cursor) query.set('cursor', transcriptState.cursor);
          const { data } = await req(`v1/notes/${encodeURIComponent(note.id)}/transcript?${query}`);
          transcript = data.transcript;
          const part = transcriptState.cursor ?? 'first';
          changes.push({
            id: note.id + ':transcript:' + part,
            version: note.updated_at,
            timestamp: note.updated_at,
            payload: { note_id: note.id, transcript },
            files: [
              {
                name: 'transcript.json',
                content: JSON.stringify(transcript),
                contentType: 'application/json'
              }
            ]
          });
          transcriptState = data.hasMore ? { note, cursor: data.cursor } : null;
        } else if (
          transcript === null &&
          !note.deleted_at &&
          !delayed.some((/** @type {any} */ entry) => entry.id === note.id)
        ) {
          if (delayed.length >= 100)
            throw new Error('Delayed transcript backlog requires attention');
          delayed.push({ id: note.id, folder });
        }
        const payload = {
          id: note.id,
          title: note.title,
          url: note.web_url,
          summary: note.summary_markdown ?? note.summary_text,
          transcript: paginated ? null : transcript,
          transcript_status: paginated
            ? 'paginated'
            : transcript === null
              ? 'pending'
              : 'available',
          deleted_at: note.deleted_at ?? null
        };
        changes.push({
          id: note.id,
          version: note.updated_at,
          timestamp: note.updated_at,
          operation: note.deleted_at ? 'deleted' : 'upsert',
          payload,
          files: [
            {
              name: 'meeting.md',
              content: `# ${note.title ?? 'Meeting'}\n\n${payload.summary ?? ''}\n\n${paginated ? 'Transcript is paginated; read the separate transcript.json chunk artifacts for this meeting.' : (transcript ?? []).map((/** @type {any} */ t) => t.text).join('\n')}`,
              contentType: 'text/markdown'
            }
          ]
        });
      }
      if (transcriptState)
        return {
          changes,
          candidateCheckpoint: {
            ...cp,
            cycleStart,
            delayed,
            transcript: { ...transcriptState, rechecking },
            listAfter: listing ?? cp.listAfter
          },
          continuation: true
        };
      if (rechecking)
        return {
          changes,
          candidateCheckpoint: { ...cp, delayed, recheck: false, transcript: null, listAfter: null }
        };
      listing ??= cp.listAfter;
      const more = listing?.hasMore;
      const nextIndex = more ? index : (index + 1) % resources.length;
      const final = !more && nextIndex === 0;
      return {
        changes,
        candidateCheckpoint: {
          ...cp,
          transcript: null,
          listAfter: null,
          cursor: more ? listing.cursor : null,
          index: nextIndex,
          since: final ? cycleStart : cp.since,
          cycleStart: final ? null : cycleStart,
          delayed,
          recheck: !cp.recheck && delayed.length > 0
        },
        continuation: more || nextIndex !== 0
      };
    });
  }
  return {
    listResources,
    readPage,
    validate: async (/** @type {any} */ credential) => {
      await listResources({ credential });
      return { accountId: credential.accountId };
    }
  };
}
export const granola = createGranola();
