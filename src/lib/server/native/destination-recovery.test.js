import { it, expect, vi } from 'vitest';
import { freshState } from './state.js';
const remote = vi.hoisted(() => ({ created: 0 }));
vi.mock('$env/dynamic/private', () => ({
  env: {
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
  }
}));
vi.mock('$env/dynamic/public', () => ({
  env: { PUBLIC_FULCRA_API_ENDPOINT: 'https://api.example/' }
}));
vi.mock('../owner.js', () => ({
  requireOwner: async () => ({ userId: 'owner', accessToken: 'test' })
}));
vi.mock('../fulcra.js', () => ({
  FulcraClient: class {
    async catalog() {
      return [];
    }
    async response() {
      remote.created++;
      throw Error('response lost after accepted creation');
    }
  }
}));
import { executeCommand } from './commands.js';
it('preserves uncertainty when a destination is created but its response is lost', async () => {
  for (const options of [{}, { name: 'Research updates' }]) {
    const result = await executeCommand(freshState('test', 'owner'), {
      url: 'https://app.example/api/destinations/types',
      method: 'POST',
      body: JSON.stringify(options),
      accessToken: 'test'
    });
    expect(result).toMatchObject({ httpStatus: 503, body: { uncertain: true } });
  }
  expect(remote.created).toBe(2);
});
it('returns a definite input error before any type creation', async () => {
  const count = remote.created;
  expect(
    await executeCommand(freshState('test', 'owner'), {
      url: 'https://app.example/api/destinations/types',
      method: 'POST',
      body: JSON.stringify({ name: '' }),
      accessToken: 'test'
    })
  ).toMatchObject({ httpStatus: 400, body: { uncertain: false } });
  expect(remote.created).toBe(count);
});
