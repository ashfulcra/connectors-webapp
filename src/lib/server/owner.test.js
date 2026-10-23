import { describe, it, expect, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: { OWNER_USER_ID: 'owner' } }));
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_FULCRA_API_ENDPOINT: 'https://api.fulcradynamics.com/' } }));
import {requireOwner} from './owner.js';
/** @param {string | undefined} token */
const cookies = token => ({ get: /** @param {string} name */ name => name === 'fulcra_access_token' ? token : undefined });
describe('verified deployment ownership', () => {
  it('rejects missing credentials before any upstream access', async () => {
    await expect(requireOwner(cookies(undefined))).rejects.toMatchObject({ status: 401 });
  });
  it('rejects a forged token rejected by the identity authority', async () => {
    await expect(requireOwner(cookies('forged'), { fetchImpl: async () => new Response('{}', {status:401}) })).rejects.toMatchObject({ status:401 });
  });
  it('denies another valid Fulcra user', async () => {
    await expect(requireOwner(cookies('valid-other'), { fetchImpl: async () => Response.json({userid:'other'}) })).rejects.toMatchObject({ status:403 });
  });
  it('allows the owner only after verified user-info', async () => {
    /** @type {typeof fetch} */
    const fetchImpl = async (url, options) => {
      expect(url).toBe('https://api.fulcradynamics.com/user/v1alpha1/info');
      expect(/** @type {Record<string,string>} */(options?.headers).Authorization).toBe('Bearer owner-token');
      return Response.json({userid:'owner'});
    };
    await expect(requireOwner(cookies('owner-token'), { fetchImpl })).resolves.toEqual({userId:'owner',accessToken:'owner-token'});
  });
  it('does not accept upstream downtime as valid identity', async () => {
    await expect(requireOwner(cookies('token'), { fetchImpl: async () => new Response('{}', {status:503}) })).rejects.toMatchObject({status:503});
  });
});
