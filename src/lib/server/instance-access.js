import { isHttpError, redirect } from '@sveltejs/kit';
import { requireOwner } from './owner.js';
/** @param {string|undefined} value */
export const instanceMode = (value = undefined) =>
  value === 'public-template' ? 'public-template' : 'personal';
const bootstrap = new Set([
  '/login',
  '/api/health',
  '/api/auth/check',
  '/api/auth/user',
  '/api/auth/token',
  '/api/auth/revoke',
  '/api/auth/device/code',
  '/api/auth/device/token'
]);
/** Apply instance-wide access before route execution, including data/guide endpoints.
 * @param {{url:URL,request:Request,cookies:Pick<import('@sveltejs/kit').Cookies,'get'>}} event
 * @param {{verifyOwner?:typeof requireOwner,landing?:{html:string,agentBrief:string}}} options */
export async function personalAccess(
  event,
  { verifyOwner = requireOwner, landing = { html: '', agentBrief: '' } } = {}
) {
  const path = event.url.pathname;
  if (
    event.request.method === 'GET' &&
    ((path === '/' && landing.html) || (path === '/agent.md' && landing.agentBrief))
  )
    return new Response(path === '/' ? landing.html : landing.agentBrief, {
      headers: {
        'Content-Type': path === '/' ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  if (
    bootstrap.has(path) ||
    path.startsWith('/_app/') ||
    path === '/api/cron' ||
    path === '/.well-known/workflow/v1/flow' ||
    path.startsWith('/api/webhooks/')
  )
    return;
  try {
    await verifyOwner(event.cookies);
  } catch (e) {
    if (
      isHttpError(e) &&
      e.status === 401 &&
      !path.startsWith('/api/') &&
      !path.startsWith('/guides/')
    )
      redirect(303, '/login');
    throw e;
  }
  if (path === '/') redirect(303, '/app');
}
