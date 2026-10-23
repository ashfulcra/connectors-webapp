import { AsyncLocalStorage } from 'node:async_hooks';
/** @type {AsyncLocalStorage<any>} */
const context = new AsyncLocalStorage();
export const currentRuntime = () => context.getStore();
/** @param {any} value @param {()=>Promise<any>} fn */
export const withRuntime = (value, fn) => context.run(value, fn);
