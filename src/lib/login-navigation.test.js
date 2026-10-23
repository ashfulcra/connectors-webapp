import { it, expect, vi } from 'vitest';
import { continueToWorkspace } from './login-navigation.js';
it('keeps account switching available for authenticated nonowners', async () => {
  const navigate = vi.fn();
  await continueToWorkspace({
    verifyOwner: async () => Response.json({ isOwner: false }),
    navigate
  });
  expect(navigate).not.toHaveBeenCalled();
});
it('keeps sign-in available when ownership verification is unavailable', async () => {
  const navigate = vi.fn();
  await continueToWorkspace({
    verifyOwner: async () => new Response('{}', { status: 503 }),
    navigate
  });
  await continueToWorkspace({
    verifyOwner: async () => {
      throw new Error('offline');
    },
    navigate
  });
  expect(navigate).not.toHaveBeenCalled();
});
it('continues only after a successful verified owner response', async () => {
  const navigate = vi.fn();
  await continueToWorkspace({
    verifyOwner: async () => Response.json({ isOwner: true }),
    navigate
  });
  expect(navigate).toHaveBeenCalledWith('/app', { replaceState: true });
});
