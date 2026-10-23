import { requireOwnerPage } from '$lib/server/owner-page';
/** @type {import('./$types').PageServerLoad} */
export async function load({ cookies }) {
  await requireOwnerPage(cookies);
  return {};
}
