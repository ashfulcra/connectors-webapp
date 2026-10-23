<script lang="ts">
  import { onMount } from 'svelte';
  import { user } from '$lib/user';
  let { initialOwner = false } = $props();
  let checkedOwner = $state<boolean | undefined>();
  const isOwner = $derived(checkedOwner ?? initialOwner);
  $effect(() => {
    if ($user.authenticated)
      fetch('/api/harness/owner')
        .then((r) => r.json())
        .then((x) => (checkedOwner = x.isOwner))
        .catch(() => (checkedOwner = false));
    else if ($user.init) checkedOwner = false;
  });
  onMount(() => {
    user.init();
  });
</script>

{#if isOwner}
  <nav aria-label="Owner navigation" class="owner-nav">
    <a class="brand" href="/" data-sveltekit-reload>Fulcra <span>Connectors</span></a>
    <div>
      <a href="/app" data-sveltekit-reload>Connections</a><a href="/harness">Build progress</a
      ><button
        onclick={async () => {
          await user.logout();
          window.location.assign('/');
        }}>Sign out</button
      >
    </div>
  </nav>
{/if}

<style>
  .owner-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 28px;
    border-bottom: 1px solid #34343e;
    color: #eee;
    background: #15151b;
  }
  .brand {
    font-size: 18px;
    font-weight: 650;
  }
  .brand span {
    font-weight: 400;
    color: #aaa;
  }
  .owner-nav div {
    display: flex;
    gap: 24px;
    align-items: center;
    font-size: 14px;
  }
  a:hover,
  button:hover {
    color: #73d9b9;
  }
  button {
    cursor: pointer;
  }
  @media (max-width: 600px) {
    .owner-nav {
      padding: 16px;
      gap: 16px;
    }
    .owner-nav div {
      gap: 12px;
      font-size: 12px;
    }
  }
</style>
