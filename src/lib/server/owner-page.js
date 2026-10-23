import { isHttpError, redirect } from '@sveltejs/kit';
import { requireOwner } from './owner.js';
/** @param {Pick<import('@sveltejs/kit').Cookies,'get'>} cookies */
export async function requireOwnerPage(cookies) {
  try {
    return await requireOwner(cookies);
  } catch (e) {
    if (isHttpError(e) && e.status === 401) redirect(303, '/login');
    throw e;
  }
}
