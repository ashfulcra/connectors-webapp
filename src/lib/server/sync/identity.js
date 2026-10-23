import { createHash } from 'node:crypto';
/** @param {any} value @returns {string} */
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
/** @param {string | Uint8Array} content */
export function contentHash(content) {
  return createHash('sha256').update(content).digest('hex');
}
/** @param {{ownerId:string,dataType:string,connectorId:string,sourceAccountId:string,routeVersion:number}} context @param {{id:string,version?:string,payload:any,observedAt?:string}} change */
export function revisionId(context, change) {
  const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const hash = createHash('sha1')
    .update(namespace)
    .update(canonical([context, change.id, change.version ?? null, change.payload]))
    .digest();
  hash[6] = (hash[6] & 15) | 80;
  hash[8] = (hash[8] & 63) | 128;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
