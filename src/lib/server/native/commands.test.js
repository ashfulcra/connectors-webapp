import { it, expect, vi } from 'vitest';
import { seal } from '../secrets.js';
import { freshState, commandResult } from './state.js';
const { crypto, execute } = vi.hoisted(() => ({
  crypto: { key: Buffer.alloc(32, 7).toString('base64'), keyId: 'v1' },
  execute: vi.fn(async (state) => {
    state.count = (state.count ?? 0) + 1;
    return { httpStatus: 200, body: { count: state.count } };
  })
}));
vi.mock('./commands.js', () => ({ executeCommand: execute, cryptoOptions: () => crypto }));
import { applyCommand, operationFailure } from '../../../../workflows/native-steps.js';
it('applies a retried command ID once and returns the original result', async () => {
  let s = freshState('d', 'o');
  const cmd = {
    id: 'same',
    envelope: seal({ url: 'https://app/api/test' }, 'd:o:native-command', crypto)
  };
  s = await applyCommand(s, cmd);
  s = await applyCommand(s, cmd);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(commandResult(s, 'same', crypto).body.count).toBe(1);
});
it('can record uncertain failure without staging more source bodies', async () => {
  const s = freshState('d', 'o');
  s.resources.big = 'x'.repeat(2097100);
  const result = await operationFailure(s, { id: 'failed' });
  expect(commandResult(result, 'failed', crypto).httpStatus).toBe(503);
});
