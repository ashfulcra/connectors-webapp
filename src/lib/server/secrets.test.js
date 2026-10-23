import {it,expect} from 'vitest';
import {seal,unseal} from './secrets.js';
const options={key:Buffer.alloc(32,7).toString('base64'),keyId:'test'};
it('seals credentials for only the exact deployment and owner context',()=>{
  const envelope=seal({refresh_token:'private'},'deployment:owner:fulcra',options);
  expect(JSON.stringify(envelope)).not.toContain('private');
  expect(unseal(envelope,'deployment:owner:fulcra',options)).toEqual({refresh_token:'private'});
  expect(()=>unseal(envelope,'deployment:other:fulcra',options)).toThrow();
  expect(()=>unseal({...envelope,ciphertext:Buffer.from('tampered').toString('base64')},'deployment:owner:fulcra',options)).toThrow();
});

it('decrypts previous key envelopes during explicit key rotation, and writes only the active key',()=>{
 const current={key:Buffer.alloc(32,8).toString('base64'),keyId:'next',previousKeys:{test:options.key}};
 const old=seal({secret:'old'},'context',options);
 expect(unseal(old,'context',current)).toEqual({secret:'old'});
 expect(seal({secret:'new'},'context',current).keyId).toBe('next');
});
