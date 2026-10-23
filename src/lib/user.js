import { env } from '$env/dynamic/public';
import { writable, get } from 'svelte/store';
import { Auth0DeviceFlow } from '$lib/auth0-device-flow.js';
import { browser } from '$app/environment';

/**
 * A writable store that takes an object and persists it to localStorage in a given key
 *
 * Persistence is built into the svelte store instead of the underlying object since
 * svelte's $ semantics are funny for accessing underlying object values. (i.e. setters
 * against object properties don't actually work unless you're modifying the full object)
 */
/** @param {string} key @param {any} initialValue */
const persistedObjectWritable = (key, initialValue) => {
  const store = writable(initialValue);
  const { subscribe, set } = store;

  // check for existing persisted values and populate
  if (browser) {
    try {
      // attempt to json deserialize an existing item
      const persistedValue = JSON.parse(localStorage.getItem(key) ?? 'null');

      // smash it into our existing value
      let updatedValue = Object.assign(initialValue, persistedValue);

      // set the new updated value
      set(updatedValue);
    } catch (error) {
      // if we had any issues loading the persisted values, just reset it
      console.error(error);
      localStorage.removeItem(key);
      set(initialValue);
    }
  }

  return {
    subscribe,
    /** @param {any} value */
    set: (value) => {
      browser && localStorage.setItem(key, JSON.stringify(value));
      set(value);
    },
    /** @param {(value:any)=>any} callback */
    update: (callback) => {
      const updatedStore = callback(get(store));
      browser && localStorage.setItem(key, JSON.stringify(updatedStore));
      set(updatedStore);
    }
  };
};

// our custom user state store instance
export const user = (() => {
  /**
   * The underlying user state object, this wraps our two sources of user info (auth0 and fulcra api)
   * as well as provides getter properties for values we can derive from the user info objects
   * like authenticated, etc
   */
  const userState = {
    init: false, // boolean that tracks whether init() has successfully run

    // getter that returns a user's authenticated state based on values in the auth0/fulcra api info objects
    get authenticated() {
      // check auth0client.isAuthenticated() as well? have to yoink out an async result
      // TODO -- check fulcraUserInfo
      return 'fulcradynamics.com/userid' in this.auth0UserInfo;
    },

    auth0UserInfo: {}, // user info object from auth0
    fulcraUserInfo: {}, // user info object from fulcra api,

    // These are the only properties we want to persist, so only serialize those into JSON which then gets shoved into localstorage
    toJSON: function () {
      return {
        auth0UserInfo: this.auth0UserInfo,
        fulcraUserInfo: this.fulcraUserInfo
      };
    }
  };

  // create our underlying persisted writable store
  const { subscribe, set, update } = persistedObjectWritable('fulcraUserState', userState);

  // private client for auth0, init() will initialize this
  /** @type {Auth0DeviceFlow} */
  let auth0;

  /**
   * Initializes a user session, this should be called at top level onMount
   * to set up auth0, etc
   */
  const _init = async () => {
    // create our auth0 device flow client
    auth0 = new Auth0DeviceFlow({
      domain: env.PUBLIC_AUTH0_DOMAIN,
      clientId: env.PUBLIC_AUTH0_CLIENT_ID,
      audience: env.PUBLIC_FULCRA_API_ENDPOINT
    });

    // Check if we have a valid access token cookie (server-side check)
    try {
      const response = await fetch('/api/auth/check');
      const { authenticated } = await response.json();

      if (authenticated) {
        // We have a valid cookie, restore the user session
        await _getUser();
      } else {
        // No valid session, clear persisted user info
        _clearUser();
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      _clearUser();
    }

    // set init to true
    update((d) => {
      d.init = true;
      return d;
    });
  };

  // Start device flow and return verification info for UI to display.
  //
  // `popup` is a window the caller opened synchronously within the click gesture
  // (required so Safari doesn't block it). We drive it through two navigations:
  // first to Auth0's logout endpoint to clear any existing SSO session, then to
  // the device-flow verification URL. Because the popup is a top-level,
  // first-party context for the Auth0 domain, the SSO cookie is actually cleared
  // — a hidden iframe would be treated as third-party and blocked by Safari's
  // ITP. This is what forces the user to actively pick an account.
  /** @param {Window | null} popup */
  const _startLogin = async (popup) => {
    try {
      // Kick off SSO logout in the popup. We can set location on a window we
      // opened even cross-origin (we just can't read it back).
      const logoutStartedAt = Date.now();
      if (popup && !popup.closed) {
        popup.location.href = `https://${env.PUBLIC_AUTH0_DOMAIN}/v2/logout`;
      }

      // Fetch the device code; this network round-trip overlaps with the logout.
      const verificationInfo = await auth0.startDeviceFlow();

      // Give the logout time to complete before sending the popup on to the
      // verification page. We can't read the cross-origin popup's state, so we
      // wait for a minimum dwell, minus whatever the fetch above already used.
      if (popup && !popup.closed) {
        const SSO_LOGOUT_DWELL_MS = 1200;
        const remaining = SSO_LOGOUT_DWELL_MS - (Date.now() - logoutStartedAt);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        if (!popup.closed) {
          popup.location.href = verificationInfo.verificationUri;
        }
      }

      return verificationInfo;
    } catch (error) {
      console.error('Failed to start device flow:', error);
      throw error;
    }
  };

  // Poll for token after user has seen verification URL
  /** @param {string} deviceCode @param {number} interval */
  const _completeLogin = async (deviceCode, interval) => {
    try {
      await auth0.pollForToken(deviceCode, interval);

      // Store access token in HTTP-only cookie via server route
      const accessToken = await auth0.getTokenSilently();
      await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken })
      });

      await _getUser();
    } catch (error) {
      console.error('Failed to complete login:', error);
      throw error;
    }
  };

  const _logout = async () => {
    // Open the Auth0 logout popup FIRST, synchronously within the sign-out click
    // gesture, so Safari doesn't block it (window.open after an await gets
    // blocked). A popup is a top-level, first-party context for the Auth0 domain,
    // so the SSO session cookie is actually cleared — a hidden iframe would be
    // treated as third-party and blocked by Safari's ITP. Without clearing it the
    // next sign-in could silently reuse the still-active session. Auto-closed
    // once it's had a moment to complete.
    let logoutPopup = null;
    if (browser) {
      logoutPopup = window.open(
        `https://${env.PUBLIC_AUTH0_DOMAIN}/v2/logout`,
        'auth0-logout',
        'width=500,height=600,left=100,top=100'
      );
    }

    // Grab the refresh token before we clear local state so we can revoke it
    const refreshToken = auth0.getRefreshToken?.();

    // Revoke the refresh token at Auth0 so it can no longer mint access tokens.
    // Best-effort: never block logout on this (proxied server-side to avoid CORS).
    if (refreshToken) {
      try {
        await fetch('/api/auth/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
      } catch (error) {
        console.error('Failed to revoke refresh token:', error);
      }
    }

    // Clear the app's access token cookie
    await fetch('/api/auth/token', { method: 'DELETE' });

    // Clear the local client + persisted user state
    await auth0.logout();
    _clearUser();

    // Close the logout popup once it's had time to clear the SSO session.
    if (logoutPopup) {
      setTimeout(() => {
        if (!logoutPopup.closed) logoutPopup.close();
      }, 1500);
    }
  };

  // grab user info from auth0 & fulcra api via server routes
  const _getUser = async () => {
    // Get Auth0 user info from server (uses HTTP-only cookie)
    const auth0Response = await fetch('/api/auth/user');
    if (!auth0Response.ok) {
      throw new Error('Failed to fetch Auth0 user info');
    }
    const userInfo = await auth0Response.json();

    // Get Fulcra user info from server (uses HTTP-only cookie)
    const fulcraResponse = await fetch('/api/user/info');
    if (!fulcraResponse.ok) {
      throw new Error('Failed to fetch Fulcra user info');
    }
    const fulcraUserInfo = await fulcraResponse.json();

    update((d) => {
      d.auth0UserInfo = userInfo;
      d.fulcraUserInfo = fulcraUserInfo;
      return d;
    });
  };

  // clear user info
  const _clearUser = () => {
    update((d) => {
      d.auth0UserInfo = {};
      d.fulcraUserInfo = {};
      return d;
    });
  };

  // return our store object
  return {
    subscribe,
    set,
    update,
    init: _init,
    startLogin: _startLogin,
    completeLogin: _completeLogin,
    logout: _logout
  };
})();
