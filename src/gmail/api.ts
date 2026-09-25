/**
 * Minimal read-only Gmail REST client. Every call runs in the browser with the user's token.
 *
 * Quota notes (Gmail API): messages.list and messages.get cost 5 units each;
 * threads.get costs 10. The per-user limit is 250 units per second (moving
 * average). All requests go through one paced queue with at most 2 in flight
 * and a minimum gap between request starts, and 429/quota responses are
 * retried with exponential backoff (1s, 2s, 4s) before giving up.
 */
import { GmailError, errorFromResponse } from "./errors";
import { scanLog } from "../lib/log";

export { GmailError } from "./errors";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export const LIMITS = {
  concurrency: 2,
  minIntervalMs: 120, // ≤ ~8 request starts/second → ≤ ~40 units/second
  retryDelaysMs: [1000, 2000, 4000],
};

type Sleep = (ms: number) => Promise<void>;
let sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Test hook: replace the delay function (and pacing) so tests run instantly. */
export function __setTiming(opts: { sleep?: Sleep; minIntervalMs?: number; retryDelaysMs?: number[] }) {
  if (opts.sleep) sleep = opts.sleep;
  if (opts.minIntervalMs !== undefined) LIMITS.minIntervalMs = opts.minIntervalMs;
  if (opts.retryDelaysMs) LIMITS.retryDelaysMs = opts.retryDelaysMs;
}

// ---------- paced queue ----------
let active = 0;
let lastStart = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active >= LIMITS.concurrency) await new Promise<void>((r) => waiting.push(r));
  active++;
  const gap = lastStart + LIMITS.minIntervalMs - Date.now();
  lastStart = Math.max(Date.now(), lastStart + LIMITS.minIntervalMs);
  if (gap > 0) await sleep(gap);
}
function release(): void {
  active--;
  waiting.shift()?.();
}

/** Bumped when a scan ends, so its leftover retries stop instead of spending quota. */
let generation = 0;
export const cancelPendingRequests = () => void generation++;

let requestCount = 0;
export const getRequestCount = () => requestCount;
export const resetRequestCount = () => (requestCount = 0);

async function get<T>(token: string, path: string, params: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  const gen = generation;
  for (let attempt = 0; ; attempt++) {
    if (gen !== generation) throw new GmailError(0, "Cancelled", "cancelled");
    await acquire();
    let res: Response;
    try {
      requestCount++;
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      release();
      throw new GmailError(0, "Network error");
    }
    release();
    if (res.ok) return res.json() as Promise<T>;
    const err = await errorFromResponse(res);
    const retryable = err.kind === "rate_limit" || err.kind === "server";
    if (!retryable || attempt >= LIMITS.retryDelaysMs.length) {
      if (err.kind === "rate_limit") scanLog("Quota/rate limit encountered; giving up after retries");
      throw err;
    }
    const base = LIMITS.retryDelaysMs[attempt];
    const wait = Math.min(Math.max(err.retryAfterMs, base), 8000) + Math.floor(Math.random() * 250);
    scanLog(`${err.kind === "rate_limit" ? "Quota/rate limit encountered" : "Server error"}; retry ${attempt + 1} in ~${Math.round(wait / 1000)}s`);
    await sleep(wait);
    if (gen !== generation) throw new GmailError(0, "Cancelled", "cancelled");
  }
}

// ---------- types ----------
interface Header {
  name: string;
  value: string;
}
interface Part {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: Part[];
  headers?: Header[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: Part;
}

// ---------- endpoints ----------
export const getProfile = (token: string) => get<{ emailAddress: string }>(token, "/profile", { fields: "emailAddress" });

/**
 * Message ids matching a Gmail search, newest first, capped at `max`.
 * One messages.list call per 100 results (5 units each).
 */
export async function listMessageIds(token: string, q: string, max: number): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  do {
    const r = await get<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(token, "/messages", {
      q,
      maxResults: Math.min(100, max - out.length),
      pageToken,
      fields: "messages(id,threadId),nextPageToken",
    });
    out.push(...(r.messages || []));
    pageToken = r.nextPageToken;
  } while (pageToken && out.length < max);
  return out.slice(0, max);
}

/** Headers and preview only (5 units). No body, no attachments. */
export const getMessageMeta = (token: string, id: string) =>
  get<GmailMessage>(token, `/messages/${id}`, {
    format: "metadata",
    metadataHeaders: ["From", "Subject", "Date"],
    fields: "id,threadId,internalDate,snippet,payload/headers",
  });

/**
 * Text parts of one message (5 units), only when the preview is not enough.
 * The fields mask keeps MIME types and inline text data but skips attachment ids and headers.
 */
export const getMessageBody = (token: string, id: string) =>
  get<GmailMessage>(token, `/messages/${id}`, {
    format: "full",
    fields: "id,threadId,payload(mimeType,body/data,parts(mimeType,body/data,parts(mimeType,body/data,parts(mimeType,body/data))))",
  });

export const header = (m: GmailMessage, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Plain-text body of a message, falling back to HTML with tags stripped. */
export function plainBody(m: GmailMessage): string {
  let text = "";
  let html = "";
  const walk = (p?: Part) => {
    if (!p) return;
    if (p.body?.data) {
      if (p.mimeType === "text/plain" && !text) text = decodeB64Url(p.body.data);
      else if (p.mimeType === "text/html" && !html) html = decodeB64Url(p.body.data);
    }
    p.parts?.forEach(walk);
  };
  walk(m.payload);
  if (text) return text;
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ");
}

/** Run async work over items with a small concurrency limit. The request queue above also paces every call. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length && !failed) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        failed = true; // stop the other workers taking new items
        throw e;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export const threadUrl = (threadId: string, account?: string) =>
  `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : "u/0/"}#all/${threadId}`;
