<script>
  import { user } from '$lib/user';
  let { minimal = false } = $props();
  import fulcraLogo from '$lib/assets/app-icon_152.png';
  // import appLogo from '$lib/assets/your-logo.svg';

  // ---- fill these in for your app ----
  const appName = 'Fulcra Connectors';
  const tagline = 'Your tools. Your context. Your Fulcra.';
  const description =
    'Connect the services you use and keep selected data flowing into your own Fulcra folders and data types.';
  const showSlots = false; // set false once you've replaced the placeholders

  /** @type {Awaited<ReturnType<import('$lib/auth0-device-flow').Auth0DeviceFlow['startDeviceFlow']>> | null} */
  let verificationInfo = $state(null);
  let polling = $state(false);
  /** @type {string | null} */
  let error = $state(null);

  async function startLogin() {
    // Open the popup synchronously within the click gesture. Safari only permits
    // window.open() in the same call stack as the user gesture; opening it after
    // an await gets blocked. We hand the window to user.startLogin(), which
    // navigates it (first to Auth0 logout to clear the SSO session, then to the
    // device-flow verification URL).
    const popup = window.open(
      'about:blank',
      'auth0-device-flow',
      'width=500,height=700,left=100,top=100'
    );

    try {
      error = null;
      verificationInfo = await user.startLogin(popup);

      // Start polling for token
      polling = true;
      await user.completeLogin(verificationInfo.deviceCode, verificationInfo.interval);

      // Close popup if still open
      if (popup && !popup.closed) {
        popup.close();
      }

      // If we get here, login succeeded
      polling = false;
      verificationInfo = null;
    } catch (err) {
      console.error('Login error:', err);
      if (popup && !popup.closed) {
        popup.close();
      }
      error = err instanceof Error ? err.message : 'Sign-in failed';
      polling = false;
      verificationInfo = null;
    }
  }
</script>

{#if minimal}
  <main class="minimal-login">
    <section aria-label="Private workspace sign in">
      <h1>Sign in</h1>
      <p>Use your Fulcra account.</p>
      {#if verificationInfo}
        <p>Enter this code in the Fulcra verification window:</p>
        <strong class="device-code">{verificationInfo.userCode}</strong>
        <p>{polling ? 'Waiting for sign-in…' : ''}</p>
        <a href={verificationInfo.verificationUri} target="_blank" rel="noopener noreferrer"
          >Open verification window</a
        >
      {:else}
        <button onclick={startLogin} disabled={polling}>Sign in with Fulcra</button>
      {/if}
      {#if error}<p role="alert">{error}</p>{/if}
    </section>
  </main>
{:else}
  <!-- -m-3 cancels the global p-3 gutter from +layout.svelte so the screen is full-bleed -->
  <div class="relative -m-3 flex min-h-screen flex-col bg-fulcra-black text-fulcra-white">
    <!-- grid wash -->
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(#ffffff0a_1px,transparent_1px),linear-gradient(90deg,#ffffff0a_1px,transparent_1px)] [mask-image:radial-gradient(70%_55%_at_50%_40%,#000_0%,transparent_100%)] bg-[length:72px_72px]"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#22222a_0%,transparent_62%)]"
    ></div>

    <header
      class="sticky top-0 z-20 flex flex-none items-center justify-between gap-6 bg-fulcra-black/70 px-7 py-5 backdrop-blur-sm"
    >
      <div class="flex items-center gap-3">
        <!-- replace this slot with <img src={appLogo} alt={appName} class="h-[30px]" /> -->
        <div
          class="grid h-[30px] min-w-[86px] place-items-center rounded-[7px] border border-dashed border-[#3d3d44] bg-[repeating-linear-gradient(135deg,#ffffff08_0_6px,transparent_6px_12px)] px-3"
        >
          <span class="font-mono text-[9.5px] tracking-[0.09em] text-fulcra-gray uppercase"
            >CONNECT</span
          >
        </div>
        <span class="text-[11px] leading-none tracking-[0.06em] text-fulcra-gray uppercase"
          >powered by</span
        >
        <div class="flex items-center gap-2">
          <img src={fulcraLogo} alt="Fulcra" class="block h-[26px] w-[26px] rounded-md" />
          <span class="text-[13.5px] font-medium tracking-[0.01em]">Fulcra</span>
        </div>
      </div>
      <div class="flex items-center gap-5 text-[13px]">
        <a
          href="https://docs.fulcradynamics.com"
          target="_blank"
          rel="noopener noreferrer"
          class="text-fulcra-gray hover:text-fulcra-white">Docs</a
        >
        <a
          href="https://support.fulcradynamics.com/en/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-fulcra-gray hover:text-fulcra-white">Support</a
        >
      </div>
    </header>

    <main class="relative grid flex-1 place-items-center px-6 pt-6 pb-14">
      <div class="w-full max-w-[452px]">
        <div class="mb-9 flex flex-col gap-3.5">
          {#if showSlots}
            <span
              class="self-start rounded-[5px] border border-fulcra-black-25 px-[7px] py-1 font-mono text-[10px] tracking-[0.1em] text-fulcra-gray uppercase"
              >app_name</span
            >
          {/if}
          <h1 class="text-[38px] leading-[1.08] font-medium tracking-[-0.02em]">{appName}</h1>
          <p class="text-[16.5px] leading-[1.5] tracking-[-0.008em] text-pretty text-[#d6d6da]">
            {tagline}
          </p>
          <p class="mt-1 text-[14.5px] leading-[1.65] text-pretty text-fulcra-gray">
            {description}
          </p>
        </div>

        <div class="rounded-lg border border-solid border-fulcra-black-25 bg-[#1b1b23] p-[22px]">
          <h2 class="mb-4 text-[15px] font-medium tracking-[-0.01em]">Get started</h2>

          {#if !verificationInfo}
            <div class="flex flex-col gap-2.5">
              <button
                class="btn h-12 w-full rounded-lg bg-fulcra-teal/20 text-[14.5px] font-medium text-fulcra-teal transition-colors hover:bg-fulcra-teal/50 hover:text-fulcra-black"
                onclick={startLogin}>Sign In</button
              >
              <button
                class="btn h-12 w-full rounded-lg border border-solid border-fulcra-black-25 bg-transparent text-[14.5px] font-normal text-fulcra-white transition-colors hover:border-fulcra-black-20 hover:bg-fulcra-black-50"
                onclick={startLogin}>Create Account</button
              >
            </div>

            {#if error}
              <p class="mt-3 text-[13px] text-fulcra-error">{error}</p>
            {/if}

            <p class="mt-4 text-[12px] leading-[1.6] text-pretty text-fulcra-gray">
              Opens a secure Auth0 window. By continuing you agree to the
              <a
                href="https://fulcra.ai/legal/terms-conditions"
                target="_blank"
                rel="noopener noreferrer"
                class="text-fulcra-gray underline hover:text-fulcra-white">Terms</a
              >
              and
              <a
                href="https://fulcra.ai/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                class="text-fulcra-gray underline hover:text-fulcra-white">Privacy Policy</a
              >.
            </p>
          {:else}
            <p class="text-[13px] leading-[1.6] text-fulcra-gray">
              A popup window has opened. Enter this code to continue:
            </p>
            <div
              class="mt-3 rounded-lg border border-solid border-fulcra-black-25 bg-fulcra-black-50 px-3 py-3 text-center"
            >
              <span class="font-mono text-2xl tracking-widest text-fulcra-white"
                >{verificationInfo.userCode}</span
              >
            </div>

            {#if polling}
              <div class="mt-4 flex items-center justify-center gap-2 text-fulcra-gray">
                <div class="loading loading-sm loading-spinner"></div>
                <span class="text-[13px]">Waiting for authentication…</span>
              </div>
            {/if}

            <p class="mt-4 text-[12px] leading-[1.6] text-fulcra-gray">
              Popup blocked?
              <a
                href={verificationInfo.verificationUri}
                target="_blank"
                rel="noopener noreferrer"
                class="text-fulcra-teal underline hover:text-fulcra-white"
                >Open the verification page</a
              >.
            </p>
          {/if}
        </div>

        <div class="mt-5 flex items-center gap-2.5 pl-0.5">
          <span class="h-[5px] w-[5px] flex-none rounded-full bg-fulcra-teal"></span>
          <p class="text-[12.5px] text-fulcra-gray">
            Sign-in handled by Auth0. Data access via the
            <a
              href="https://docs.fulcradynamics.com"
              class="text-fulcra-gray underline hover:text-fulcra-white">Fulcra API</a
            >.
          </p>
        </div>

        {#if showSlots}
          <div class="mt-7 flex flex-col gap-[7px] border-t border-fulcra-black-25 pt-4">
            <p class="font-mono text-[11px] leading-[1.7] text-fulcra-gray">
              Template slots on this screen: your logo, app_name, tagline, description.
            </p>
            <p class="font-mono text-[11px] leading-[1.7] text-fulcra-gray">
              Replace them in your fork, then set showSlots to false.
            </p>
          </div>
        {/if}
      </div>
    </main>
  </div>
{/if}

<style>
  .minimal-login {
    margin: -12px;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #16161d;
    color: #eef2f0;
    padding: 24px;
    font:
      15px/1.6 system-ui,
      sans-serif;
  }
  .minimal-login section {
    width: 100%;
    max-width: 320px;
  }
  .minimal-login h1 {
    font-size: 24px;
    font-weight: 550;
    margin-bottom: 8px;
  }
  .minimal-login p {
    color: #acb6b8;
    margin: 12px 0;
  }
  .minimal-login button {
    width: 100%;
    padding: 12px 18px;
    margin-top: 16px;
    border: 1px solid #6ab79e;
    border-radius: 6px;
    background: #9ce6ca;
    color: #16251e;
    font-weight: 600;
    cursor: pointer;
  }
  .minimal-login button:disabled {
    opacity: 0.6;
  }
  .minimal-login a {
    color: #9ce6ca;
    text-decoration: underline;
  }
  .minimal-login .device-code {
    font:
      24px ui-monospace,
      monospace;
    letter-spacing: 0.15em;
  }
  .minimal-login [role='alert'] {
    color: #ffafa4;
  }
</style>
