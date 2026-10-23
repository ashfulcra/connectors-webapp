import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // adapter-auto auto-detects the host at build time (Vercel, Netlify,
    // Cloudflare Pages, Azure SWA) — see https://svelte.dev/docs/kit/adapter-auto.
    // It does NOT cover self-hosted Node/Docker: for that, swap this for
    // '@sveltejs/adapter-node' (kept in devDependencies) and run `node build`.
    // See https://svelte.dev/docs/kit/adapters for more on adapters.
    adapter: adapter()
  }
};

export default config;
