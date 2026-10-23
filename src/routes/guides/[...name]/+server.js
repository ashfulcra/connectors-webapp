import { error } from '@sveltejs/kit';
import { publicGuides } from '$lib/server/public-guides';
/** @type {import('./$types').RequestHandler} */
export function GET({ params }) {
  const content = Object.hasOwn(publicGuides, params.name) ? publicGuides[params.name] : undefined;
  if (!content) error(404, 'Guide not found');
  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
