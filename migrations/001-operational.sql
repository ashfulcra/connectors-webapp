BEGIN;
-- Serialize DDL before taking any table lock; concurrent ALTER lock upgrades deadlock.
SELECT pg_advisory_xact_lock(hashtextextended('fulcra-connectors-schema-v1',0));
CREATE TABLE IF NOT EXISTS connector_deployments (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS connector_connections (
 id uuid PRIMARY KEY, deployment_id uuid NOT NULL REFERENCES connector_deployments(id), owner_id uuid NOT NULL,
 connector text NOT NULL, label text NOT NULL, account_id text NOT NULL, config jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','paused','reauthorize','disconnected','required_configuration')),
 generation bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS connector_grants (
 deployment_id uuid NOT NULL REFERENCES connector_deployments(id), owner_id uuid NOT NULL, key text NOT NULL,
 encrypted jsonb NOT NULL, expires_at timestamptz, status text NOT NULL DEFAULT 'ready', updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(deployment_id,owner_id,key)
);
CREATE TABLE IF NOT EXISTS connector_checkpoints (
 connection_id uuid PRIMARY KEY REFERENCES connector_connections(id), value jsonb, pending jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS connector_jobs (
 id uuid PRIMARY KEY, connection_id uuid NOT NULL REFERENCES connector_connections(id),
 generation bigint NOT NULL, kind text NOT NULL DEFAULT 'sync', due_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','failed')),
 lease_token uuid, lease_version bigint NOT NULL DEFAULT 0, lease_expires_at timestamptz,
 attempt integer NOT NULL DEFAULT 0, continuation jsonb, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_jobs_active ON connector_jobs(connection_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS connector_jobs_due ON connector_jobs(due_at) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS connector_deliveries (
 connection_id uuid NOT NULL REFERENCES connector_connections(id), revision_id uuid NOT NULL, sink text NOT NULL,
 artifact_key text NOT NULL, receipt jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,revision_id,sink,artifact_key)
);
CREATE TABLE IF NOT EXISTS connector_webhooks (
 connection_id uuid NOT NULL REFERENCES connector_connections(id), event_id text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(connection_id,event_id)
);
ALTER TABLE connector_webhooks ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE connector_webhooks ADD COLUMN IF NOT EXISTS processed_at timestamptz;
CREATE TABLE IF NOT EXISTS connector_resources (
 connection_id uuid NOT NULL REFERENCES connector_connections(id), id text NOT NULL, details jsonb NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(connection_id,id)
);
ALTER TABLE connector_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE connector_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE connector_checkpoints ADD COLUMN IF NOT EXISTS value_expires_at timestamptz;
ALTER TABLE connector_checkpoints ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz;
ALTER TABLE connector_checkpoints ADD COLUMN IF NOT EXISTS staging_expired boolean NOT NULL DEFAULT false;
COMMIT;
