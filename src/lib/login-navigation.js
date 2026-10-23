/** Continue only after server verification, never from persisted client identity.
 * @param {{verifyOwner:()=>Promise<Response>,navigate:(path:string,options:{replaceState:boolean})=>unknown}} options */
export async function continueToWorkspace({ verifyOwner, navigate }) {
  try {
    const response = await verifyOwner();
    if (response.ok && (await response.json()).isOwner === true)
      await navigate('/app', { replaceState: true });
  } catch {
    // Keep the login and account-selection controls available on verification failure.
  }
}
