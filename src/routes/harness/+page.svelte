<script>
  import HarnessDashboard from '$lib/components/HarnessDashboard.svelte';
  let {data}=$props();
</script>
<svelte:head><title>Build progress · Fulcra Connectors</title></svelte:head>
<HarnessDashboard initial={data.dashboard} />
