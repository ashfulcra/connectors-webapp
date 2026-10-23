import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
/** @param {{key:string,keyId:string,previousKeys?:Record<string,string>}} options */
function keyBytes(options) {
  const bytes = Buffer.from(options.key, 'base64');
  if (bytes.length !== 32) throw new Error('A 32-byte server encryption key is required');
  return bytes;
}
/** @param {any} value @param {string} context @param {{key:string,keyId:string,previousKeys?:Record<string,string>}} options */
export function seal(value, context, options) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(options), nonce);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    keyId: options.keyId,
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64')
  };
}
/** @param {any} envelope @param {string} context @param {{key:string,keyId:string,previousKeys?:Record<string,string>}} options */
export function unseal(envelope, context, options) {
  const key =
    envelope.keyId === options.keyId ? options.key : options.previousKeys?.[envelope.keyId];
  if (!key) throw new Error('Unknown credential key ID');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBytes({ ...options, key }),
    Buffer.from(envelope.nonce, 'base64')
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
  );
}
