import { revisionId } from './identity.js';
import { deliver, verify, validateRoute } from './sinks.js';
/** @param {any} connection @param {any} change @param {string} ownerId */
export function prepareOutput(connection, change, ownerId) {
  const route = connection.config.route;
  const id = revisionId(
    {
      ownerId,
      dataType: route.recordType ?? route.folder,
      connectorId: connection.connector,
      sourceAccountId: connection.account_id,
      routeVersion: connection.config.routeVersion ?? 1
    },
    change
  );
  const timestamp = change.timestamp ?? change.updatedAt;
  if (!timestamp || !Number.isFinite(Date.parse(timestamp)))
    throw new Error('Source timestamp required');
  const record = {
    id,
    start_time: timestamp,
    end_time: timestamp,
    sources: [`connectors.${connection.connector}`],
    connector: connection.connector,
    source_id: change.id,
    source_version: change.version ?? '',
    operation: change.operation ?? 'upsert',
    payload: change.payload
  };
  const files = (
    change.files ?? [
      {
        name: 'document.json',
        content: JSON.stringify(change.payload, null, 2),
        contentType: 'application/json'
      }
    ]
  ).map((/** @type {any} */ file) => ({
    path: `${id}/${file.name}`,
    content: file.content,
    contentType: file.contentType
  }));
  return { record, files };
}
/** Every network operation must honor deadline; no detached work after the response.
 * @param {{store:any,adapters:Record<string,any>,credentials:(connection:any)=>Promise<any>,getClient:(connection:any)=>Promise<any>,deadline:number,maxJobs?:number}} options */
export async function runTick({ store, adapters, credentials, getClient, deadline, maxJobs = 1 }) {
  await store.purgeExpiredStaging?.();
  const result = { claimed: 0, verified: 0, pending: 0, failed: 0 };
  const checkTime = () => {
    if (Date.now() + 1000 >= deadline) throw new Error('deadline');
  };
  for (let n = 0; n < maxJobs && Date.now() + 1000 < deadline; n++) {
    const [job] = await store.claimDueJobs(1);
    if (!job) break;
    result.claimed++;
    try {
      checkTime();
      const connection = await store.getConnection(job.connection_id);
      const adapter = adapters[connection.connector];
      if (!adapter) throw new Error('required_configuration');
      const checkpoint = await store.getCheckpoint(connection.id);
      if (checkpoint.expired) {
        await store.reschedule(job, new Date(Date.now() + 1000), 'staging_expired_reconciliation');
        result.pending++;
        continue;
      }
      let pending = checkpoint.pending;
      if (!pending || pending.resetRequired) {
        checkTime();
        const credential = await credentials(connection);
        const hints = (await store.listWebhookHints?.(connection.id)) ?? [];
        const page = await adapter.readPage({
          connection,
          credential,
          checkpoint: pending?.resetRequired ? null : checkpoint.value,
          deadline,
          hints
        });
        if (page.retryAt) {
          await store.reschedule(job, new Date(page.retryAt), 'rate_limited');
          result.pending++;
          continue;
        }
        if (page.resetRequired) {
          await store.savePending(job, { resetRequired: true });
          await store.reschedule(job, new Date(Date.now() + 1000), 'reconciliation_required');
          result.pending++;
          continue;
        }
        if (!Array.isArray(page.changes) || page.changes.length > 100)
          throw new Error('Invalid bounded change page');
        pending = {
          outputs: page.changes.map((/** @type {any} */ change) =>
            prepareOutput(connection, change, store.ownerId)
          ),
          candidateCheckpoint: page.candidateCheckpoint,
          continuation: page.continuation ?? null,
          ackHintIds: page.ackHintIds ?? hints.map((/** @type {any} */ h) => h.event_id)
        };
        await store.savePending(job, pending);
      }
      checkTime();
      const client = await getClient(connection);
      const route = connection.config.route;
      const schema = route.mode === 'file' ? {} : await client.schema(route.recordType);
      if (route.mode !== 'file' && client.catalog)
        validateRoute({ ...route, ownerId: store.ownerId }, await client.catalog(), schema);
      const fencedClient = {
        readRecord: (/** @type {any[]} */ ...args) => client.readRecord(...args),
        findFileByHash: client.findFileByHash
          ? (/** @type {any[]} */ ...args) => client.findFileByHash(...args)
          : undefined,
        allocateFile: client.allocateFile
          ? (/** @type {any[]} */ ...args) =>
              store.withLease(job, async () => {
                checkTime();
                return client.allocateFile(...args);
              })
          : undefined,
        transferFile: client.transferFile
          ? (/** @type {any[]} */ ...args) =>
              store.withLease(job, async () => {
                checkTime();
                return client.transferFile(...args);
              })
          : undefined,
        uploadFile: (/** @type {any[]} */ ...args) =>
          store.withLease(job, async () => {
            checkTime();
            return client.uploadFile(...args);
          }),
        writeRecords: (/** @type {any[]} */ ...args) =>
          store.withLease(job, async () => {
            checkTime();
            return client.writeRecords(...args);
          })
      };
      let allVerified = true;
      for (const output of pending.outputs) {
        checkTime();
        const existing = await store.getDeliveries(connection.id, output.record.id);
        const receipts = await deliver(output, route, fencedClient, schema, existing, (receipt) =>
          store.saveDelivery(job, output.record.id, receipt)
        );
        for (const receipt of receipts) {
          checkTime();
          if (receipt.status !== 'verified' && receipt.status !== 'failed') {
            try {
              receipt.status = await verify(receipt, client);
            } catch {
              receipt.status = 'pending';
            }
            await store.saveDelivery(job, output.record.id, receipt);
          }
          if (receipt.status !== 'verified') allVerified = false;
        }
      }
      if (allVerified) {
        const nextDue = new Date(
          Date.now() +
            (pending.continuation
              ? 1000
              : Math.max(60, connection.config.intervalSeconds ?? 300) * 1000)
        );
        if (pending.ackHintIds?.length)
          await store.commitCheckpoint(
            job,
            pending.candidateCheckpoint,
            nextDue,
            pending.ackHintIds
          );
        else await store.commitCheckpoint(job, pending.candidateCheckpoint, nextDue);
        result.verified++;
      } else {
        await store.reschedule(job, new Date(Date.now() + 30000), 'verification_pending');
        result.pending++;
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      const code = /reauthorize|required_configuration/.test(message)
        ? 'authorization_required'
        : message === 'deadline'
          ? 'budget_exhausted'
          : 'sync_failed';
      try {
        await store.reschedule(job, new Date(Date.now() + 60000), code);
      } catch {
        /* A newer lease or generation owns recovery. */
      }
      result.failed++;
    }
  }
  return result;
}
