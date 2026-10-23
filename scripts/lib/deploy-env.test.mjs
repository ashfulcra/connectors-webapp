import {test} from 'node:test';import assert from 'node:assert/strict';
const mod=await import('./deploy-env.mjs').catch(()=>({}));
test('migrates the legacy deployment identity without submitting a Vercel reserved key',()=>{
 assert.equal(typeof mod.deploymentEnvironment,'function');
 const env=mod.deploymentEnvironment({DEPLOYMENT_ID:'existing-identity',OWNER_USER_ID:'owner'});
 assert.equal(env.CONNECTORS_DEPLOYMENT_ID,'existing-identity');assert.ok(!('DEPLOYMENT_ID' in env));assert.equal(env.OWNER_USER_ID,'owner');
 assert.equal(mod.deploymentEnvironment({DEPLOYMENT_ID:'old',CONNECTORS_DEPLOYMENT_ID:'canonical'}).CONNECTORS_DEPLOYMENT_ID,'canonical');
});
