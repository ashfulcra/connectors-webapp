<script>
  import './layout.css';
  import { blur } from 'svelte/transition';
  import { page } from '$app/state';
  import OwnerNav from '$lib/components/OwnerNav.svelte';

  let { children, data } = $props();
</script>

{#if page.url.pathname !== '/' && page.url.pathname !== '/guide'}<OwnerNav
    initialOwner={data.isOwner}
  />{/if}
{#key page.url.pathname}
  <div class="flex h-full min-h-screen w-full flex-col p-3" in:blur>
    {@render children()}
  </div>
{/key}

<style>
  :global(BODY) {
    background-color: transparent !important;
  }

  :global(html:root) {
    background-color: transparent !important;
  }
</style>
