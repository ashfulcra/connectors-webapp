<script lang="ts">
  import {onMount} from 'svelte';
  let {initial=null}:{initial:any}=$props();
  let snapshot=$state<any>(null),error=$state(''),responseLoaded=$state(false);
  const current=$derived(snapshot??initial);
  const events=$derived((current?.runs?.events??[]).toSorted((a:any,b:any)=>Date.parse(b.start_time)-Date.parse(a.start_time)));
  const invalidCount=$derived(current?.runs?.invalidCount??0),overview=$derived(current?.overview??''),issues=$derived(current?.issues??''),loading=$derived(!current&&!responseLoaded);
  async function refresh(){
    try {
      const responses=await Promise.all(['runs','overview','issues'].map(name=>fetch(`/api/harness/${name}`)));
      if(responses.some(r=>!r.ok)) throw new Error(responses.some(r=>r.status===401)?'Sign in with the deployment owner account.':responses.some(r=>r.status===403)?'This dashboard belongs to another Fulcra user.':'Build progress is temporarily unavailable.');
      const [runs,summary,outstanding]=await Promise.all(responses.map(r=>r.json()));
      snapshot={runs,overview:summary.text,issues:outstanding.text};error='';
    }catch(e){error=e instanceof Error?e.message:'Unable to load build progress';}finally{responseLoaded=true;}
  }
  onMount(()=>{refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer);});
</script>
<main class="harness">
  <p class="eyebrow">OWNER WORKSPACE</p><h1>Build progress</h1><p class="intro">Live milestones and evaluation evidence from your Fulcra v1 run log.</p>
  {#if error}<div role="alert" class="notice">{error} <a href="/">Return to sign in</a></div>{/if}
  {#if loading}<p>Loading verified run events…</p>{/if}
  {#if !error && !loading}
    <div class="panels"><section><h2>Project overview</h2><pre>{overview || 'No overview has been recorded.'}</pre></section><section><h2>Outstanding checks</h2><pre>{issues || 'No outstanding checks recorded.'}</pre></section></div>
    <div class="section-title"><h2>Run evidence</h2><span>{events.length} events</span></div>
    {#if invalidCount}<p role="alert">{invalidCount} malformed records were excluded. They have not been counted as successful work.</p>{/if}
    {#if !events.length}<p>No run events are queryable yet.</p>{/if}
    {#each events as event (event.id)}
      <article><div class="event-head"><span class="badge">{event.milestone_id}</span><strong>{event.step}</strong><span class:failed={event.status==='failed'} class="status">{event.status}</span><time>{new Date(event.start_time).toLocaleString()}</time></div><h3>{event.detail}</h3><p>{event.evidence}</p><small>{event.role} · Run {event.run_id} · Revision {event.revision.slice(0,7)}</small></article>
    {/each}
  {/if}
</main>
<style>
  .harness{max-width:1160px;margin:0 auto;padding:48px 24px 80px;color:#eee}.eyebrow{color:#73d9b9;letter-spacing:.16em;font-size:11px;font-weight:700}h1{font-size:38px;font-weight:600;margin:10px 0}.intro{color:#aaa;margin-bottom:32px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:18px}section,article{border:1px solid #34343e;background:#1b1b23;border-radius:12px;padding:22px}h2{font-size:17px;font-weight:600;margin-bottom:14px}pre{white-space:pre-wrap;font:13px/1.7 inherit;color:#bbb}.section-title{display:flex;justify-content:space-between;align-items:center;margin:36px 0 15px}.section-title span,small,time{color:#93939f;font-size:12px}article{margin-bottom:12px}article p{font-size:14px;color:#c4c4ce;line-height:1.7;margin:10px 0}h3{font-size:16px;margin-top:14px}.event-head{display:flex;gap:12px;align-items:center;font-size:12px}.event-head time{margin-left:auto}.badge{background:#73d9b920;color:#73d9b9;padding:4px 8px;border-radius:5px}.status{color:#73d9b9}.failed{color:#ff938f}.notice{padding:20px;background:#30303b;border-radius:8px}a{color:#73d9b9}@media(max-width:700px){.panels{grid-template-columns:1fr}.event-head{flex-wrap:wrap}.event-head time{margin-left:0}}
</style>
