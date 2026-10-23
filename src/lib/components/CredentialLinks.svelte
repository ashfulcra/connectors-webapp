<script lang="ts">
  import type { ConnectorSetup } from '$lib/connectors/setup.js';
  let { info }: { info: ConnectorSetup } = $props();
</script>

<div class="credential-links">
  {#if info.credentialUrl}
    <a class="action" href={info.credentialUrl} target="_blank" rel="noopener noreferrer"
      >{info.credentialLink} ↗</a
    >
  {:else}
    <strong>{info.credentialNote}</strong>
  {/if}
  {#each info.additionalCredentialLinks ?? [] as link}
    <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>
  {/each}
  <a href={info.setupUrl} target="_blank" rel="noopener noreferrer">{info.setupLink} ↗</a>
</div>

<style>
  .credential-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    margin: 14px 0;
  }
  a {
    font-size: 12px;
    color: #9daab8;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .action {
    color: #93e3c9;
    font-weight: 600;
  }
  strong {
    font-size: 12px;
    color: #c0cad8;
  }
</style>
