import { randomUUID } from 'node:crypto';
import { seal, unseal } from './secrets.js';

/** @param {{pool:any,deploymentId:string,ownerId:string,crypto?:any}} options */
export function createStore({ pool, deploymentId, ownerId, crypto }) {
  const stageTTL = 24 * 60 * 60 * 1000;
  /** @param {string} id @param {string} kind @param {any} value */
  function encodeStage(id, kind, value) {
    if (!crypto) throw new Error('Server staging encryption required_configuration');
    const expiresAt = new Date(Date.now() + stageTTL).toISOString();
    return {
      envelope: {
        stagingVersion: 1,
        encrypted: seal(
          { value, expiresAt },
          `${deploymentId}:${ownerId}:stage:${id}:${kind}`,
          crypto
        )
      },
      expiresAt
    };
  }
  /** @param {string} id @param {string} kind @param {any} envelope */
  function decodeStage(id, kind, envelope) {
    if (!envelope) return null;
    const stage = unseal(
      envelope.encrypted,
      `${deploymentId}:${ownerId}:stage:${id}:${kind}`,
      crypto
    );
    if (Date.parse(stage.expiresAt) <= Date.now()) throw new Error('Staging expired');
    return stage.value;
  }
  /** @param {string|null} id */
  async function purgeExpiredStaging(id = null) {
    await assertOwner();
    await pool.query(
      `UPDATE connector_checkpoints p SET
      value=CASE WHEN (p.value_expires_at<=now() OR (p.value IS NOT NULL AND p.value->>'stagingVersion' IS DISTINCT FROM '1')) THEN NULL ELSE p.value END,
      pending=CASE WHEN (p.pending_expires_at<=now() OR (p.pending IS NOT NULL AND p.pending->>'stagingVersion' IS DISTINCT FROM '1')) THEN NULL ELSE p.pending END,
      staging_expired=true
      FROM connector_connections c WHERE c.id=p.connection_id AND c.deployment_id=$1 AND c.owner_id=$2 AND ($3::uuid IS NULL OR c.id=$3)
      AND ((p.value IS NOT NULL AND (p.value_expires_at<=now() OR p.value->>'stagingVersion' IS DISTINCT FROM '1')) OR (p.pending IS NOT NULL AND (p.pending_expires_at<=now() OR p.pending->>'stagingVersion' IS DISTINCT FROM '1')))`,
      [deploymentId, ownerId, id]
    );
    await pool.query(
      `UPDATE connector_deliveries d SET receipt=d.receipt-'transferEncrypted'-'transferExpiresAt'
      FROM connector_connections c WHERE c.id=d.connection_id AND c.deployment_id=$1 AND c.owner_id=$2 AND ($3::uuid IS NULL OR c.id=$3)
      AND d.receipt ? 'transferExpiresAt' AND (d.receipt->>'transferExpiresAt')::timestamptz<=now()`,
      [deploymentId, ownerId, id]
    );
  }
  const context = [deploymentId, ownerId];
  /** @param {any} db */
  async function assertOwner(db = pool) {
    const result = await db.query('SELECT owner_id FROM connector_deployments WHERE id=$1', [
      deploymentId
    ]);
    if (result.rows[0]?.owner_id !== ownerId) throw new Error('Deployment owner mismatch');
  }
  /** @param {(client:any)=>Promise<any>} fn */
  async function withTransaction(fn) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await assertOwner(db);
      const value = await fn(db);
      await db.query('COMMIT');
      return value;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
  /** @param {string} key @param {any} grant @param {any} db */
  async function saveGrant(key, grant, db = pool) {
    await assertOwner(db);
    await db.query(
      `INSERT INTO connector_grants(deployment_id,owner_id,key,encrypted,expires_at,status) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(deployment_id,owner_id,key) DO UPDATE SET encrypted=excluded.encrypted,expires_at=excluded.expires_at,status=excluded.status,updated_at=now()`,
      [...context, key, grant.encrypted, grant.expiresAt ?? null, grant.status ?? 'ready']
    );
  }
  /** @param {any} row */
  function grantValue(row) {
    return row
      ? {
          encrypted: row.encrypted,
          expiresAt: row.expires_at?.toISOString() ?? null,
          status: row.status
        }
      : null;
  }
  /** Lock the connection first everywhere; pause and claims use the same order.
   * @param {any} job @param {(db:any)=>Promise<any>} fn */
  async function withLease(job, fn) {
    return withTransaction(async (db) => {
      const connection = (
        await db.query(
          'SELECT * FROM connector_connections WHERE id=$3 AND deployment_id=$1 AND owner_id=$2 FOR UPDATE',
          [...context, job.connection_id]
        )
      ).rows[0];
      const lease = (
        await db.query('SELECT * FROM connector_jobs WHERE id=$1 FOR UPDATE', [job.id])
      ).rows[0];
      if (
        !connection ||
        connection.status !== 'ready' ||
        String(connection.generation) !== String(job.generation) ||
        !lease ||
        lease.status !== 'running' ||
        lease.lease_token !== job.lease_token ||
        String(lease.lease_version) !== String(job.lease_version) ||
        Date.parse(lease.lease_expires_at) <= Date.now()
      )
        throw new Error('Stale or inactive lease');
      return fn(db);
    });
  }
  /** @param {string} id @param {any} db @param {Date} due */
  async function enqueue(id, db = pool, due = new Date()) {
    await assertOwner(db);
    const r = await db.query(
      `INSERT INTO connector_jobs(id,connection_id,generation,due_at)
      SELECT $4,id,generation,$5 FROM connector_connections WHERE deployment_id=$1 AND owner_id=$2 AND id=$3 AND status='ready'
      ON CONFLICT(connection_id) WHERE status IN ('queued','running') DO NOTHING RETURNING *`,
      [...context, id, randomUUID(), due]
    );
    return r.rows[0] ?? null;
  }
  return {
    pool,
    deploymentId,
    ownerId,
    assertOwner,
    withTransaction,
    saveGrant,
    withLease,
    purgeExpiredStaging,
    enqueue,
    /** @param {string} id @param {string} status @param {any} config @param {string|number|null} expectedGeneration @param {boolean} resetCheckpoint */
    async changeGeneration(
      id,
      status,
      config = null,
      expectedGeneration = null,
      resetCheckpoint = !!config
    ) {
      return withTransaction(async (db) => {
        const c = (
          await db.query(
            'UPDATE connector_connections SET generation=generation+1,status=$4,config=coalesce($5,config),updated_at=now() WHERE deployment_id=$1 AND owner_id=$2 AND id=$3 AND ($6::bigint IS NULL OR generation=$6) RETURNING *',
            [...context, id, status, config, expectedGeneration]
          )
        ).rows[0];
        if (!c) throw new Error('Unknown connection');
        await db.query(
          "UPDATE connector_jobs SET status='failed',last_error='generation_changed' WHERE connection_id=$1 AND status IN ('queued','running')",
          [id]
        );
        if (resetCheckpoint)
          await db.query('DELETE FROM connector_checkpoints WHERE connection_id=$1', [id]);
        return c;
      });
    },
    /** @param {number} limit */
    async claimDueJobs(limit = 1) {
      return withTransaction(async (db) => {
        const candidates = (
          await db.query(
            `SELECT c.id FROM connector_connections c WHERE c.deployment_id=$1 AND c.owner_id=$2 AND c.status='ready'
          AND EXISTS(SELECT 1 FROM connector_jobs j WHERE j.connection_id=c.id AND j.generation=c.generation AND j.due_at<=now() AND (j.status='queued' OR (j.status='running' AND j.lease_expires_at<=now())))
          ORDER BY (SELECT min(j.due_at) FROM connector_jobs j WHERE j.connection_id=c.id AND j.status IN ('queued','running')),c.id FOR UPDATE OF c SKIP LOCKED LIMIT $3`,
            [...context, limit]
          )
        ).rows;
        const result = [];
        for (const c of candidates) {
          const rows = (
            await db.query(
              `UPDATE connector_jobs SET status='running',started_at=now(),lease_token=$2,lease_version=lease_version+1,lease_expires_at=now()+interval '55 seconds',attempt=attempt+1
            WHERE id=(SELECT id FROM connector_jobs WHERE connection_id=$1 AND due_at<=now() AND (status='queued' OR (status='running' AND lease_expires_at<=now())) ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
              [c.id, randomUUID()]
            )
          ).rows;
          result.push(...rows);
        }
        return result;
      });
    },
    /** @param {any} job */
    async assertLease(job) {
      return withLease(job, async () => true);
    },
    /** @param {string} id */
    async getCheckpoint(id) {
      await purgeExpiredStaging(id);
      const r = await pool.query(
        'SELECT p.* FROM connector_checkpoints p JOIN connector_connections c ON c.id=p.connection_id WHERE c.deployment_id=$1 AND c.owner_id=$2 AND c.id=$3',
        [...context, id]
      );
      const row = r.rows[0];
      if (!row) return { value: null, pending: null };
      const expired = row.staging_expired;
      if (expired)
        await pool.query(
          'UPDATE connector_checkpoints SET staging_expired=false WHERE connection_id=$1',
          [id]
        );
      return {
        value: decodeStage(id, 'value', row.value),
        pending: decodeStage(id, 'pending', row.pending),
        expired
      };
    },
    /** @param {any} job @param {any} pending */
    async savePending(job, pending) {
      const staged = encodeStage(job.connection_id, 'pending', pending);
      return withLease(job, async (db) => {
        await db.query(
          'INSERT INTO connector_checkpoints(connection_id,pending,pending_expires_at) VALUES($1,$2,$3) ON CONFLICT(connection_id) DO UPDATE SET pending=excluded.pending,pending_expires_at=excluded.pending_expires_at,updated_at=now()',
          [job.connection_id, staged.envelope, staged.expiresAt]
        );
      });
    },
    /** @param {any} job @param {string} revision @param {any} receipt */
    async saveDelivery(job, revision, receipt) {
      const persisted = { ...receipt };
      if (persisted.transfer) {
        const stage = encodeStage(
          job.connection_id,
          `transfer:${revision}:${receipt.path ?? receipt.id}`,
          persisted.transfer
        );
        persisted.transferEncrypted = stage.envelope;
        persisted.transferExpiresAt = stage.expiresAt;
        delete persisted.transfer;
      }

      return withLease(job, async (db) => {
        await db.query(
          `INSERT INTO connector_deliveries(connection_id,revision_id,sink,artifact_key,receipt) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(connection_id,revision_id,sink,artifact_key) DO UPDATE SET receipt=excluded.receipt,updated_at=now()`,
          [job.connection_id, revision, receipt.sink, receipt.path ?? receipt.id, persisted]
        );
      });
    },
    /** @param {string} id @param {string} revision */
    async getDeliveries(id, revision) {
      await assertOwner();
      return (
        await pool.query(
          'SELECT d.receipt FROM connector_deliveries d JOIN connector_connections c ON c.id=d.connection_id WHERE c.deployment_id=$1 AND c.owner_id=$2 AND c.id=$3 AND d.revision_id=$4',
          [...context, id, revision]
        )
      ).rows.map((/** @type {any} */ r) => {
        const receipt = { ...r.receipt };
        if (receipt.transferEncrypted) {
          if (Date.parse(receipt.transferExpiresAt) > Date.now())
            receipt.transfer = decodeStage(
              id,
              `transfer:${revision}:${receipt.path ?? receipt.id}`,
              receipt.transferEncrypted
            );
          delete receipt.transferEncrypted;
          delete receipt.transferExpiresAt;
        }
        return receipt;
      });
    },
    /** @param {any} job @param {Date} due @param {string|null} error */
    async reschedule(job, due, error = null) {
      return withLease(job, async (db) => {
        await db.query(
          "UPDATE connector_jobs SET status='queued',due_at=$2,last_error=$3,lease_token=null,lease_expires_at=null WHERE id=$1",
          [job.id, due, error]
        );
      });
    },
    /** @param {string} id @param {any[]} resources */
    async saveResources(id, resources) {
      return withTransaction(async (db) => {
        const c = await db.query(
          'SELECT id FROM connector_connections WHERE deployment_id=$1 AND owner_id=$2 AND id=$3',
          [...context, id]
        );
        if (!c.rowCount) throw new Error('Unknown connection');
        for (const resource of resources)
          await db.query(
            'INSERT INTO connector_resources(connection_id,id,details) VALUES($1,$2,$3) ON CONFLICT(connection_id,id) DO UPDATE SET details=excluded.details,verified_at=now()',
            [id, resource.id, resource]
          );
      });
    },
    /** @param {string} id */
    async getResources(id) {
      await assertOwner();
      return (
        await pool.query(
          "SELECT r.details FROM connector_resources r JOIN connector_connections c ON c.id=r.connection_id WHERE c.deployment_id=$1 AND c.owner_id=$2 AND c.id=$3 AND r.verified_at>now()-interval '1 day'",
          [...context, id]
        )
      ).rows.map((/** @type {any} */ r) => r.details);
    },
    /** @param {string} id @param {string} eventId @param {any} payload */
    async recordWebhook(id, eventId, payload) {
      return withTransaction(async (db) => {
        const c = (
          await db.query(
            'SELECT id,status FROM connector_connections WHERE deployment_id=$1 AND owner_id=$2 AND id=$3 FOR UPDATE',
            [...context, id]
          )
        ).rows[0];
        if (!c || !['ready', 'paused'].includes(c.status)) throw new Error('Inactive connection');
        const r = await db.query(
          'INSERT INTO connector_webhooks(connection_id,event_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',
          [id, eventId, payload]
        );
        if (r.rowCount) await enqueue(id, db);
        return r.rowCount === 1;
      });
    },
    /** @param {string} id */
    async listWebhookHints(id) {
      await assertOwner();
      return (
        await pool.query(
          'SELECT w.event_id,w.payload FROM connector_webhooks w JOIN connector_connections c ON c.id=w.connection_id WHERE c.deployment_id=$1 AND c.owner_id=$2 AND c.id=$3 AND w.processed_at IS NULL ORDER BY w.received_at LIMIT 20',
          [...context, id]
        )
      ).rows;
    },
    /** @param {any} job @param {any} value @param {Date|null} nextDue @param {string[]} ackHintIds */
    async commitCheckpoint(job, value, nextDue = null, ackHintIds = []) {
      const staged = encodeStage(job.connection_id, 'value', value);
      return withLease(job, async (db) => {
        await db.query(
          'INSERT INTO connector_checkpoints(connection_id,value,pending,value_expires_at,pending_expires_at) VALUES($1,$2,null,$3,null) ON CONFLICT(connection_id) DO UPDATE SET value=excluded.value,pending=null,value_expires_at=excluded.value_expires_at,pending_expires_at=null,updated_at=now()',
          [job.connection_id, staged.envelope, staged.expiresAt]
        );
        await db.query(
          "UPDATE connector_jobs SET status='complete',completed_at=now(),lease_token=null,lease_expires_at=null WHERE id=$1",
          [job.id]
        );
        if (ackHintIds.length)
          await db.query(
            'UPDATE connector_webhooks SET processed_at=now() WHERE connection_id=$1 AND event_id=ANY($2::text[])',
            [job.connection_id, ackHintIds]
          );
        if (nextDue) await enqueue(job.connection_id, db, nextDue);
      });
    },
    async pauseAllConnections() {
      return withTransaction(async (db) => {
        const rows = (
          await db.query(
            "UPDATE connector_connections SET status='paused',generation=generation+1,updated_at=now() WHERE deployment_id=$1 AND owner_id=$2 AND status='ready' RETURNING id",
            context
          )
        ).rows;
        for (const row of rows)
          await db.query(
            "UPDATE connector_jobs SET status='failed',last_error='background_disconnected' WHERE connection_id=$1 AND status IN ('queued','running')",
            [row.id]
          );
      });
    },
    async initialize() {
      await pool.query(
        'INSERT INTO connector_deployments(id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        context
      );
      await assertOwner();
    },
    /** @param {{connector:string,label:string,accountId:string,config:any}} input */
    async createConnection(input) {
      await assertOwner();
      const id = randomUUID();
      const r = await pool.query(
        'INSERT INTO connector_connections(id,deployment_id,owner_id,connector,label,account_id,config) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [id, ...context, input.connector, input.label, input.accountId, input.config]
      );
      return r.rows[0];
    },
    /** @param {string} id */
    async connectionStatus(id) {
      await assertOwner();
      const r = await pool.query(
        `SELECT (SELECT max(started_at) FROM connector_jobs WHERE connection_id=c.id) last_attempt,
      (SELECT max(completed_at) FROM connector_jobs WHERE connection_id=c.id) last_verified_sync,
      (SELECT max(updated_at) FROM connector_deliveries WHERE connection_id=c.id AND receipt->>'status'='verified') last_verified_delivery,
      (SELECT count(*)::int FROM connector_jobs WHERE connection_id=c.id AND status IN ('queued','running')) backlog,
      (SELECT last_error FROM connector_jobs WHERE connection_id=c.id ORDER BY created_at DESC LIMIT 1) last_error,
      (SELECT count(*)::int FROM connector_deliveries WHERE connection_id=c.id AND receipt->>'status'='failed') failed_items,
      (SELECT status FROM connector_grants WHERE deployment_id=c.deployment_id AND owner_id=c.owner_id AND key='provider:'||c.id) credential_status
      FROM connector_connections c WHERE c.deployment_id=$1 AND c.owner_id=$2 AND c.id=$3`,
        [...context, id]
      );
      return r.rows[0] ?? null;
    },
    /** @param {string} id */
    async retryQueued(id) {
      await assertOwner();
      await pool.query(
        "UPDATE connector_jobs j SET due_at=now() FROM connector_connections c WHERE j.connection_id=c.id AND c.deployment_id=$1 AND c.owner_id=$2 AND c.id=$3 AND j.status='queued'",
        [...context, id]
      );
    },
    async listConnections() {
      await assertOwner();
      return (
        await pool.query(
          'SELECT * FROM connector_connections WHERE deployment_id=$1 AND owner_id=$2 ORDER BY created_at',
          context
        )
      ).rows;
    },
    /** @param {string} id */
    async getConnection(id) {
      await assertOwner();
      return (
        (
          await pool.query(
            'SELECT * FROM connector_connections WHERE deployment_id=$1 AND owner_id=$2 AND id=$3',
            [...context, id]
          )
        ).rows[0] ?? null
      );
    },
    /** @param {string} key */
    async getGrant(key) {
      await assertOwner();
      return grantValue(
        (
          await pool.query(
            'SELECT * FROM connector_grants WHERE deployment_id=$1 AND owner_id=$2 AND key=$3',
            [...context, key]
          )
        ).rows[0]
      );
    },
    /** @param {string} key */
    async deleteGrant(key) {
      await assertOwner();
      await pool.query(
        'DELETE FROM connector_grants WHERE deployment_id=$1 AND owner_id=$2 AND key=$3',
        [...context, key]
      );
    },
    /** @param {string} key @param {(row:any,db:any)=>Promise<any>} fn */
    async withGrantLock(key, fn) {
      return withTransaction(async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${deploymentId}:${ownerId}:${key}`
        ]);
        const row = grantValue(
          (
            await db.query(
              'SELECT * FROM connector_grants WHERE deployment_id=$1 AND owner_id=$2 AND key=$3 FOR UPDATE',
              [...context, key]
            )
          ).rows[0]
        );
        const result = await fn(row, db);
        if (result.patch) await saveGrant(key, { ...row, ...result.patch }, db);
        return result;
      });
    }
  };
}
