/**
 * Google sign-in for Gmail, using Google Identity Services' token model.
 *
 * The access token lives only in memory and expires after about an hour.
 * No refresh token is issued in the browser, so the user clicks "Connect
 * Gmail" again when it lapses. The client ID is the user's own (pasted in
 * Settings), so the app is their personal Google app.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

let loader: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loader = null;
        reject(new AuthError("load_failed", "Couldn't load Google sign-in. Check your connection or ad blocker."));
      };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export class AuthError extends Error {
  constructor(
    public code: "load_failed" | "popup_closed" | "access_denied" | "scope_missing" | "config" | "unknown",
    message: string,
  ) {
    super(message);
  }
}

let token: { value: string; expiresAt: number } | null = null;

export const hasValidToken = () => !!token && Date.now() < token.expiresAt - 60_000;
export const getToken = () => (hasValidToken() ? token!.value : null);

/** Opens Google's consent popup (or reuses consent silently) and resolves with an access token. */
export async function connect(clientId: string, opts: { hint?: string } = {}): Promise<string> {
  await loadGis();
  const oauth2 = window.google!.accounts.oauth2;
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (r) => {
        if (r.error) {
          const code = r.error === "access_denied" ? "access_denied" : r.error.includes("client") ? "config" : "unknown";
          reject(new AuthError(code, describe(code, r.error_description || r.error)));
          return;
        }
        if (!r.access_token || !oauth2.hasGrantedAllScopes(r, GMAIL_SCOPE)) {
          reject(new AuthError("scope_missing", describe("scope_missing")));
          return;
        }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => {
        const code = e.type === "popup_closed" ? "popup_closed" : e.type === "popup_failed_to_open" ? "unknown" : "unknown";
        reject(new AuthError(code, describe(code, e.message)));
      },
    });
    client.requestAccessToken({ prompt: "", hint: opts.hint });
  });
}

export function disconnect(): Promise<void> {
  const t = token?.value;
  token = null;
  if (!t || !window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res) => window.google!.accounts.oauth2.revoke(t, () => res()));
}

export function forgetToken(): void {
  token = null;
}

function describe(code: AuthError["code"], detail?: string): string {
  switch (code) {
    case "popup_closed":
      return "The Google window was closed before you finished. Try again.";
    case "access_denied":
      return "Gmail access wasn't allowed. Click Connect Gmail and choose Allow to use inbox scanning.";
    case "scope_missing":
      return 'Tick the box that lets the app "View your email messages and settings", then try again.';
    case "config":
      return `Google rejected the client ID. Check it in Settings and that this site's address is an authorised JavaScript origin. (${detail ?? ""})`;
    default:
      return `Google sign-in failed${detail ? `: ${detail}` : "."} If a popup blocker is on, allow popups for this site.`;
  }
}
