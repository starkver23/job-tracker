/**
 * Classifying Gmail API failures so the user sees the right fix.
 * Quota problems must never be reported as "the API is not enabled".
 */

export type GmailErrorKind = "rate_limit" | "api_disabled" | "auth" | "permission" | "server" | "network" | "other";

export class GmailError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason = "",
    public retryAfterMs = 0,
  ) {
    super(message);
    this.name = "GmailError";
  }
  get kind(): GmailErrorKind {
    return classifyGmailError(this.status, this.reason, this.message);
  }
}

const RATE_REASONS = new Set(["ratelimitexceeded", "userratelimitexceeded", "quotaexceeded", "dailylimitexceeded", "resource_exhausted"]);
const RATE_TEXT = /quota|rate[ -]?limit|too many requests|resource[_ ]exhausted|user rate/i;
const DISABLED_REASONS = new Set(["accessnotconfigured", "service_disabled", "servicedisabled"]);
const DISABLED_TEXT = /has not been used in project|is disabled|not been enabled|api (?:is )?not enabled|service_disabled|accessnotconfigured/i;

export function classifyGmailError(status: number, reason: string, message: string): GmailErrorKind {
  const r = reason.toLowerCase();
  if (status === 0) return "network";
  if (status === 429 || RATE_REASONS.has(r) || RATE_TEXT.test(message)) return "rate_limit";
  if (DISABLED_REASONS.has(r) || DISABLED_TEXT.test(message)) return "api_disabled";
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status >= 500) return "server";
  return "other";
}

export const RATE_LIMIT_MESSAGE =
  "Gmail is temporarily rate-limiting this scan. Please wait a minute and try again. Your applications already stored in this browser are safe.";

export function gmailErrorMessage(e: GmailError): string {
  switch (e.kind) {
    case "rate_limit":
      return RATE_LIMIT_MESSAGE;
    case "api_disabled":
      return "The Gmail API isn't enabled in your Google Cloud project. Enable it under APIs & Services → Library → Gmail API, wait a minute, then scan again.";
    case "auth":
      return "Your Gmail sign-in has expired. Click Scan Gmail to connect again.";
    case "permission":
      return "Google didn't allow this request. Reconnect Gmail and make sure you tick the permission to view your email.";
    case "server":
      return "Gmail had a temporary problem. Try again in a minute.";
    case "network":
      return "Couldn't reach Gmail. Check your internet connection and try again.";
    default:
      return `Gmail returned an error: ${e.message}`;
  }
}

/** Build a GmailError from a failed fetch Response, reading Google's error envelope. */
export async function errorFromResponse(res: Response): Promise<GmailError> {
  let message = res.statusText || `HTTP ${res.status}`;
  let reason = "";
  try {
    const body = await res.json();
    const err = body?.error;
    if (err) {
      message = err.message || message;
      reason = err.errors?.[0]?.reason || err.status || err.details?.find((d: { reason?: string }) => d.reason)?.reason || "";
    }
  } catch {
    /* body not JSON */
  }
  const ra = Number(res.headers.get("Retry-After"));
  return new GmailError(res.status, message, reason, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0);
}
