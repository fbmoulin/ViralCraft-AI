/* global Clerk */
/**
 * Vanilla-JS Clerk integration. Loads the Clerk JS SDK from CDN, renders
 * sign-in / user-button widgets, and provides a small helper API that the
 * rest of the app can use to attach the JWT to fetch requests.
 *
 * Required env on the server side: CLERK_PUBLISHABLE_KEY exposed via either
 *   <meta name="clerk-publishable-key" content="pk_test_...">
 * or a global `window.CLERK_PUBLISHABLE_KEY` set before this script runs.
 */
(async function () {
  let publishableKey =
    document.querySelector('meta[name="clerk-publishable-key"]')?.content ||
    window.CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    try {
      const res = await fetch('/api/public-config');
      const data = await res.json();
      publishableKey = data?.clerkPublishableKey;
    } catch (_) {
      // ignore
    }
  }

  if (!publishableKey) {
    console.warn('Clerk: publishable key not configured — auth disabled');
    window.ViralAuth = noopAuth();
    return;
  }

  // Inject Clerk CDN script — host derived from the publishable key prefix.
  const frontendApi = decodeFrontendApi(publishableKey);
  const script = document.createElement('script');
  script.setAttribute('data-clerk-publishable-key', publishableKey);
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
  script.onload = () => bootstrap(publishableKey);
  document.head.appendChild(script);

  async function bootstrap(key) {
    await Clerk.load({ publishableKey: key });

    window.ViralAuth = {
      isSignedIn: () => Boolean(Clerk.user),
      getUser: () => Clerk.user,
      async getToken() {
        return Clerk.session ? Clerk.session.getToken() : null;
      },
      async fetch(input, init = {}) {
        const token = await this.getToken();
        const headers = new Headers(init.headers || {});
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
      onChange(cb) {
        Clerk.addListener(cb);
      },
      openSignIn(opts) {
        Clerk.openSignIn(opts);
      },
      openSignUp(opts) {
        Clerk.openSignUp(opts);
      },
      signOut() {
        return Clerk.signOut();
      }
    };

    mountWidgets();
    // Sync the local user row on first sign-in
    if (Clerk.user) {
      window.ViralAuth.fetch('/api/me/sync', { method: 'POST' }).catch(() => {});
    }
    document.dispatchEvent(new CustomEvent('viral-auth-ready'));
  }

  function mountWidgets() {
    const userButtonEl = document.getElementById('clerk-user-button');
    const signInEl = document.getElementById('clerk-sign-in');

    if (Clerk.user && userButtonEl) {
      Clerk.mountUserButton(userButtonEl);
      if (signInEl) signInEl.style.display = 'none';
    } else if (signInEl) {
      Clerk.mountSignIn(signInEl);
      if (userButtonEl) userButtonEl.style.display = 'none';
    }
  }

  function decodeFrontendApi(pk) {
    // Clerk publishable keys look like `pk_test_<base64>` where the base64
    // decodes to the frontend API host with a trailing `$`.
    try {
      const b64 = pk.split('_').pop();
      const decoded = atob(b64);
      return decoded.replace(/\$$/, '');
    } catch (_) {
      return 'clerk.accounts.dev';
    }
  }

  function noopAuth() {
    return {
      isSignedIn: () => false,
      getUser: () => null,
      getToken: async () => null,
      fetch: (input, init) => fetch(input, init),
      onChange: () => {},
      openSignIn: () => alert('Auth not configured'),
      openSignUp: () => alert('Auth not configured'),
      signOut: async () => {}
    };
  }
})();
