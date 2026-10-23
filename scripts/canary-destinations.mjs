import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {cli,request,token,readState,saveState} from './lib/fulcra.mjs';
import {FulcraClient} from '../src/lib/server/fulcra.js';
import {contentHash} from '../src/lib/server/sync/identity.js';

const state=await readState();
const namespace='com.fulcradynamics.connectors.canary.v1';
if(!state.canaryType){
  const existing=(await request('/input/v1/data_type')).filter(x=>x.description===namespace);
  assert.ok(existing.length<=1,'Ambiguous existing canary types');
  state.canaryType=existing[0]?.id;
  if(!state.canaryType){
    const fields=JSON.stringify({type:'object',properties:{payload:{type:'object',properties:{sample:{type:'string'},revision:{type:'integer'}},required:['sample','revision']}},required:['payload']});
    state.canaryType=JSON.parse(execFileSync(cli,['data-type','create','Event','Connector destination canary','--description',namespace,'--fields',fields],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).id;
  }
  state.canaryRecordId=randomUUID();state.canaryRevisionId=randomUUID();await saveState(state);
}
const client=new FulcraClient({endpoint:'https://api.fulcradynamics.com/',accessToken:token()});
const schema=await client.schema(state.canaryType);assert.ok(schema.properties.payload);
const first={id:state.canaryRecordId,start_time:'2020-01-01T00:00:00Z',end_time:'2020-01-01T00:00:00Z',payload:{sample:'synthetic canary',revision:1},sources:['com.fulcradynamics.connectors.canary.v1']};
const second={...first,id:state.canaryRevisionId,payload:{sample:'synthetic canary',revision:2}};
async function readback(record){for(let n=0;n<15;n++){const found=await client.readRecord(state.canaryType,record.id);if(found){assert.deepEqual(found.payload,record.payload);return found;}await new Promise(r=>setTimeout(r,2000));}throw new Error('Canary readback pending; IDs preserved in deployment state');}
const receipt=await client.writeRecords(state.canaryType,[first]);await readback(first);
const duplicate=await client.writeRecords(state.canaryType,[first]);await readback(first);
await client.writeRecords(state.canaryType,[second]);await readback(second);
const query=`{__name__=${JSON.stringify(state.canaryType)},id=${JSON.stringify(first.id)}}`;
const raw=await client.response(`data/v1/records?q=${encodeURIComponent(query)}`);const rows=(await raw.text()).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
const content=JSON.stringify({kind:'synthetic connector file canary',id:state.canaryRecordId});
const file=await client.uploadFile(`/workspace/connectors-webapp/artifact/canary/${state.canaryRecordId}.json`,content,'application/json');
const bytes=await client.readFileBytes(file.id);assert.equal(contentHash(bytes),contentHash(content));
const result={time:new Date().toISOString(),dataType:state.canaryType,nestedSchemaVisible:true,historicalRecordQueryable:true,duplicateRows:rows.filter(x=>x.id===first.id).length,changedRevisionVerified:true,fileInputId:file.id,fileHash:contentHash(bytes),receipt:receipt.upload_id,duplicateReceipt:duplicate.upload_id};
assert.equal(result.duplicateRows,1,'Duplicate ID behavior must be reconciled before enablement');
await writeFile('.private/destination-canary.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
