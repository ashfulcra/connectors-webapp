import { adapters } from './connectors/index.js';
import { githubInstallationCredential } from './connectors/github-auth.js';
import { garminPersonalCredential } from './connectors/garmin-auth.js';
/** Select auth handling from the server-checked connector, never a caller's credential kind.
 * @param {keyof typeof adapters} connector @param {any} input @param {{fetchImpl?:typeof fetch}} options */
export async function enrollProviderCredential(connector, input = {}, options = {}) {
  let credential;
  if (connector === 'garmin') {
    credential = await garminPersonalCredential(
      { kind: 'garmin_personal', apiKey: input.token },
      options
    );
  } else {
    if (input.kind && !(connector === 'github' && input.kind === 'github_app'))
      throw Error('Invalid credential kind');
    credential =
      connector === 'github' ? await githubInstallationCredential(input, options) : input;
  }
  const verified = await adapters[connector].validate(credential);
  if (!verified.accountId) throw Error('Stable source account identity required_configuration');
  if (connector === 'garmin') {
    const details = /** @type {{accountId:string,timeZone:string}} */ (verified);
    credential = { ...credential, accountId: details.accountId, timeZone: details.timeZone };
  }
  return { credential, accountId: verified.accountId };
}
