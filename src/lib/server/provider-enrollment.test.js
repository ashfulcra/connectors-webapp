import { it, expect, vi } from 'vitest';
import { enrollProviderCredential } from './provider-enrollment.js';
import { adapters } from './connectors/index.js';
it('binds Garmin credentials only to server-verified identity and discards client cache/account claims', async () => {
  const validate = vi
    .spyOn(adapters.garmin, 'validate')
    .mockResolvedValue({ accountId: '42', timeZone: 'UTC' });
  try {
    const result = await enrollProviderCredential(
      'garmin',
      {
        token: 'synthetic-personal-key',
        accountId: 'forged',
        kind: 'github_app',
        expiresAt: '2099-01-01',
        apiKey: 'wrong'
      },
      {
        fetchImpl: async () => Response.json({ access_token: 'synthetic-bearer', expires_in: 3600 })
      }
    );
    expect(result.accountId).toBe('42');
    expect(result.credential).toMatchObject({
      kind: 'garmin_personal',
      apiKey: 'synthetic-personal-key',
      token: 'synthetic-bearer',
      accountId: '42',
      timeZone: 'UTC'
    });
    expect(validate).toHaveBeenCalledOnce();
  } finally {
    validate.mockRestore();
  }
});
it('does not dispatch a foreign credential type or break static credentials', async () => {
  await expect(
    enrollProviderCredential('notion', { kind: 'garmin_personal', apiKey: 'synthetic' })
  ).rejects.toThrow(/credential kind/);
  const validate = vi
    .spyOn(adapters.notion, 'validate')
    .mockResolvedValue({ accountId: 'fixture-account' });
  try {
    const credential = { token: 'synthetic-read-token' };
    expect(await enrollProviderCredential('notion', credential)).toEqual({
      credential,
      accountId: 'fixture-account'
    });
  } finally {
    validate.mockRestore();
  }
});
