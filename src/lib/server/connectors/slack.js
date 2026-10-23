import { providerHTTP, rateAware, selectedResources } from './http.js';
/** Exact decimal Slack timestamp arithmetic; never round source identity through Number. @param {string} ts */
const micros = (ts) => {
  const [s, f = ''] = ts.split('.');
  return BigInt(s) * 1000000n + BigInt(f.padEnd(6, '0').slice(0, 6));
};
/** @param {bigint} us */
const stamp = (us) => `${us / 1000000n}.${String(us % 1000000n).padStart(6, '0')}`;
/** @param {string} channel @param {any} message */
function normalize(channel, message) {
  const ts = message.ts;
  return {
    id: channel + ':' + ts,
    version: message.edited?.ts ?? ts,
    timestamp: new Date(Number(micros(message.edited?.ts ?? ts) / 1000n)).toISOString(),
    operation: 'upsert',
    payload: {
      channel,
      ts,
      thread_ts: message.thread_ts ?? null,
      text: message.text ?? '',
      user: message.user ?? message.bot_id ?? null,
      edited_ts: message.edited?.ts ?? null
    },
    files: [{ name: 'message.md', content: message.text ?? '', contentType: 'text/markdown' }]
  };
}
/** @param {{fetchImpl?:typeof fetch}} options */
export function createSlack({ fetchImpl = fetch } = {}) {
  /** @param {any} credential @param {number} deadline */
  function http(credential, deadline) {
    const req = providerHTTP({ base: 'https://slack.com/api/', credential, fetchImpl, deadline });
    return async (/** @type {string} */ path) => {
      const r = await req(path);
      if (!r.data.ok)
        throw new Error(
          [
            'invalid_auth',
            'token_revoked',
            'account_inactive',
            'missing_scope',
            'not_in_channel'
          ].includes(r.data.error)
            ? 'Slack reauthorize'
            : 'Slack request failed'
        );
      return r.data;
    };
  }
  /** @param {any} input */
  async function listResources({ credential, cursor = null, deadline = Date.now() + 10000 }) {
    const q = new URLSearchParams({
      types: 'public_channel,private_channel',
      limit: '100',
      exclude_archived: 'true'
    });
    if (cursor) q.set('cursor', cursor);
    const data = await http(credential, deadline)('conversations.list?' + q);
    return {
      resources: data.channels
        .filter((/** @type {any} */ c) => c.is_member)
        .map((/** @type {any} */ c) => ({ id: c.id, name: '#' + c.name, kind: 'channel' })),
      nextCursor: data.response_metadata?.next_cursor || null
    };
  }
  /** @param {any} input */
  async function readPage({ connection, credential, checkpoint, deadline, hints = [] }) {
    return rateAware(async () => {
      const resources = selectedResources(connection),
        cp = structuredClone(checkpoint ?? { index: 0, channels: {} });
      cp.channels ??= {};
      const req = http(credential, deadline);
      if (hints.length) {
        const hint = hints[0],
          event = hint.payload?.event ?? {},
          channel = event.channel;
        const ackHintIds = [hint.event_id];
        if (!resources.includes(channel))
          return { changes: [], candidateCheckpoint: cp, ackHintIds, continuation: true };
        if (event.subtype === 'message_deleted') {
          await req('conversations.info?channel=' + encodeURIComponent(channel));
          return {
            changes: [
              {
                id: channel + ':' + event.deleted_ts,
                version: 'deleted:' + (event.event_ts ?? event.deleted_ts),
                timestamp: new Date(
                  Number(micros(event.event_ts ?? event.deleted_ts) / 1000n)
                ).toISOString(),
                operation: 'deleted',
                payload: { channel, ts: event.deleted_ts, status: 'deleted' }
              }
            ],
            candidateCheckpoint: cp,
            ackHintIds,
            continuation: true
          };
        }
        const threadTs = event.message?.thread_ts ?? event.thread_ts;
        if (threadTs) {
          cp.hintThreads ??= [];
          if (
            !cp.hintThreads.some(
              (/** @type {any} */ t) => t.channel === channel && t.ts === threadTs
            )
          )
            cp.hintThreads.push({ channel, ts: threadTs, cursor: null });
          return { changes: [], candidateCheckpoint: cp, ackHintIds, continuation: true };
        }
        const ts = event.message?.ts ?? event.ts;
        if (ts) {
          const data = await req(
            'conversations.history?' +
              new URLSearchParams({
                channel,
                oldest: ts,
                latest: ts,
                inclusive: 'true',
                limit: '1'
              })
          );
          return {
            changes: data.messages
              .filter((/** @type {any} */ m) => m.ts === ts)
              .map((/** @type {any} */ m) => normalize(channel, m)),
            candidateCheckpoint: cp,
            ackHintIds,
            continuation: true
          };
        }
        return { changes: [], candidateCheckpoint: cp, ackHintIds, continuation: true };
      }
      if (cp.hintThreads?.length) {
        const thread = cp.hintThreads[0];
        if (!resources.includes(thread.channel)) throw new Error('Unselected Slack thread');
        const q = new URLSearchParams({ channel: thread.channel, ts: thread.ts, limit: '15' });
        if (thread.cursor) q.set('cursor', thread.cursor);
        const data = await req('conversations.replies?' + q);
        thread.cursor = data.response_metadata?.next_cursor || null;
        if (!thread.cursor) cp.hintThreads.shift();
        return {
          changes: data.messages.map((/** @type {any} */ m) => normalize(thread.channel, m)),
          candidateCheckpoint: cp,
          continuation: true
        };
      }
      const index = cp.index ?? 0,
        channel = resources[index % resources.length],
        state = cp.channels[channel] ?? {
          phase: 'history',
          since: stamp(BigInt(Date.parse(connection.config.backfillSince)) * 1000n),
          threads: []
        };
      const changes = [];
      if (state.phase === 'threads' && state.threads.length) {
        const thread = state.threads[0],
          q = new URLSearchParams({ channel, ts: thread.ts, limit: '15' });
        if (thread.cursor) q.set('cursor', thread.cursor);
        const data = await req('conversations.replies?' + q);
        changes.push(...data.messages.map((/** @type {any} */ m) => normalize(channel, m)));
        thread.cursor = data.response_metadata?.next_cursor || null;
        if (!thread.cursor) state.threads.shift();
      } else {
        const latest = state.latest ?? stamp(BigInt(Date.now()) * 1000n);
        state.latest = latest;
        const q = new URLSearchParams({
          channel,
          oldest: stamp(micros(state.since) > 120000000n ? micros(state.since) - 120000000n : 0n),
          latest,
          inclusive: 'true',
          limit: '15'
        });
        if (state.historyCursor) q.set('cursor', state.historyCursor);
        const data = await req('conversations.history?' + q);
        for (const m of data.messages) {
          changes.push(normalize(channel, m));
          if (!state.high || micros(m.ts) > micros(state.high)) state.high = m.ts;
          if (m.reply_count > 0 && !state.threads.some((/** @type {any} */ t) => t.ts === m.ts))
            state.threads.push({ ts: m.ts, cursor: null });
        }
        state.historyCursor = data.response_metadata?.next_cursor || null;
        if (data.has_more && !state.historyCursor && data.messages.length) {
          state.latest = stamp(micros(data.messages.at(-1).ts) - 1n);
          state.historyCursor = null;
        } else if (!state.historyCursor) state.phase = 'threads';
      }
      if (state.threads.length > 500)
        throw new Error('Slack thread backlog exceeds bound; select a smaller backfill');
      let more = state.phase === 'history' || state.threads.length > 0;
      if (!more) {
        state.since = state.high ?? state.since;
        state.high = null;
        state.latest = null;
        state.phase = 'history';
        cp.index = (index + 1) % resources.length;
      }
      cp.channels[channel] = state;
      return { changes, candidateCheckpoint: cp, continuation: more || cp.index !== 0 };
    });
  }
  return {
    listResources,
    readPage,
    validate: async (/** @type {any} */ credential) => {
      const data = await http(credential, Date.now() + 10000)('auth.test');
      return { accountId: data.team_id + ':' + data.user_id };
    }
  };
}
export const slack = createSlack();
