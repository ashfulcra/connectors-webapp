import {it,expect} from 'vitest';
import {authorizeCron} from './cron-auth.js';
it('fails closed when secret is absent or wrong and accepts only a matching bearer',()=>{
 expect(()=>authorizeCron(new Headers(),undefined)).toThrow();
 expect(()=>authorizeCron(new Headers({Authorization:'Bearer wrong'}),'correct')).toThrow();
 expect(authorizeCron(new Headers({Authorization:'Bearer correct'}),'correct')).toBe(true);
});
