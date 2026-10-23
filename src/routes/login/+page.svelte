<script>
  let { data } = $props();
  import { goto } from '$app/navigation';
  import { user } from '$lib/user';
  import { continueToWorkspace } from '$lib/login-navigation';
  import LoginDeviceFlow from '$lib/components/LoginDeviceFlow.svelte';
  $effect(() => {
    if ($user.init && $user.authenticated)
      continueToWorkspace({ verifyOwner: () => fetch('/api/harness/owner'), navigate: goto });
  });
</script>

<svelte:head><title>Owner sign in — Fulcra Connectors</title></svelte:head>
{#if !data.personal}<a class="back" href="/">← About this template</a>{/if}
<LoginDeviceFlow minimal={data.personal} />

<style>
  .back {
    display: block;
    position: relative;
    z-index: 30;
    padding: 14px 20px;
    color: #9ce6ca;
    background: #16161d;
    font-size: 13px;
    margin: -12px -12px 12px;
  }
</style>
