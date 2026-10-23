import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {token,readState} from './lib/fulcra.mjs';
const base=process.argv[2]||'http://localhost:6173';
const state=await readState(); const auth={Cookie:'fulcra_access_token='+token()};
const results=[];
for(const [label,headers,status] of [['missing',{},401],['forged',{Cookie:'fulcra_access_token=forged'},401],['owner',auth,200]]){
 const r=await fetch(base+'/api/harness/runs',{headers});assert.equal(r.status,status,label+' runs authorization');
 if(label==='owner'){
   const data=await r.json();assert.ok(data.events.length>=3);assert.ok(data.events.some(x=>x.run_id===state.runId && x.evidence));
   results.push({check:label+' runs',status:r.status,events:data.events.length,invalidCount:data.invalidCount});
 }else results.push({check:label+' runs',status:r.status});
}
const page=await fetch(base+'/harness',{headers:auth});const html=await page.text();assert.equal(page.status,200);
assert.ok(html.includes(state.runId),'authenticated rendered dashboard must include the actual run ID');
assert.ok(html.includes('Build progress'));assert.ok(html.includes('Authenticated schema')||html.includes('Created Event schema'));
results.push({check:'authenticated dashboard rendered real run evidence',status:page.status});
for(const name of ['overview','issues']){const r=await fetch(base+'/api/harness/'+name,{headers:auth});const d=await r.json();assert.equal(r.status,200);assert.ok(d.text.length>50);results.push({check:name,status:r.status,characters:d.text.length});}
const denied=await fetch(base+'/harness',{redirect:'manual'});assert.equal(denied.status,303);results.push({check:'unauthenticated dashboard redirect',status:denied.status});
await writeFile('.private/baseline-evaluation.json',JSON.stringify({base,time:new Date().toISOString(),results},null,2));
console.log(JSON.stringify({base,results}));
