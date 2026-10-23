import { createSign } from 'node:crypto';
/** @param {any} credential @param {{fetchImpl?:typeof fetch}} options */
export async function githubInstallationCredential(credential, { fetchImpl = fetch } = {}) {
  if (credential.kind !== 'github_app') return credential;
  if (credential.token && Date.parse(credential.expiresAt) > Date.now() + 60000) return credential;
  if (!/^\d+$/.test(credential.installationId) || !credential.appId || !credential.privateKey)
    throw new Error('GitHub App required_configuration');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: credential.appId })
  ).toString('base64url');
  const unsigned = header + '.' + claims;
  const jwt =
    unsigned +
    '.' +
    createSign('RSA-SHA256').update(unsigned).sign(credential.privateKey, 'base64url');
  const response = await fetchImpl(
    `https://api.github.com/app/installations/${credential.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + jwt,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10'
      },
      body: JSON.stringify({
        permissions: { issues: 'read', pull_requests: 'read', metadata: 'read' }
      }),
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'GitHub App reauthorize'
        : 'GitHub App temporarily unavailable'
    );
  const data = await response.json();
  if (!data.token || !Number.isFinite(Date.parse(data.expires_at)))
    throw new Error('Invalid GitHub installation grant');
  return { ...credential, token: data.token, expiresAt: data.expires_at };
}
