import {json,isHttpError} from '@sveltejs/kit';
import {requireOwner} from '$lib/server/owner';
/** @type {import('./$types').RequestHandler} */
export async function GET({cookies}) {
  try { await requireOwner(cookies); return json({isOwner:true},{headers:{'Cache-Control':'no-store'}}); }
  catch(e) { if(isHttpError(e) && (e.status===401 || e.status===403)) return json({isOwner:false},{headers:{'Cache-Control':'no-store'}}); throw e; }
}
