import { currentRuntime } from './runtime-context.js';
import { Pool } from 'pg';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createStore } from './store';
/** @type {InstanceType<typeof Pool> | undefined} */
let pool;
export function runtime() {
  const native = currentRuntime();
  if (native) return native;
  if (
    !env.DATABASE_URL ||
    !env.CONNECTORS_DEPLOYMENT_ID ||
    !env.OWNER_USER_ID ||
    !env.CREDENTIAL_ENCRYPTION_KEY
  )
    error(503, 'Configure managed PostgreSQL and the server encryption key to continue');
  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
  const crypto = {
    key: env.CREDENTIAL_ENCRYPTION_KEY,
    keyId: env.CREDENTIAL_KEY_ID || 'v1',
    previousKeys: JSON.parse(env.CREDENTIAL_PREVIOUS_KEYS || '{}')
  };
  return {
    store: createStore({
      pool,
      deploymentId: env.CONNECTORS_DEPLOYMENT_ID,
      ownerId: env.OWNER_USER_ID,
      crypto
    }),
    crypto
  };
}
/** @param {Request} request @param {URL} url */
export function sameOrigin(request, url) {
  if (request.headers.get('origin') !== url.origin)
    error(403, 'This action must start from this deployment');
}
