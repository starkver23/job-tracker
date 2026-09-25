/** Minimal read-only Gmail REST client. Every call runs in the browser with the user's token. */

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(token: string, path: string, params: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json())?.error?.message || msg;
    } catch {
      /* body not JSON */
    }
    throw new GmailError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

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
export interface GmailThread {
  id: string;
  messages?: GmailMessage[];
}

export const getProfile = (token: string) => get<{ emailAddress: string }>(token, "/profile");

/** Thread ids matching a Gmail search query, across pages, up to `max`. */
export async function searchThreadIds(token: string, q: string, max = 150): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await get<{ threads?: { id: string }[]; nextPageToken?: string }>(token, "/threads", {
      q,
      maxResults: Math.min(100, max - ids.length),
      pageToken,
    });
    (r.threads || []).forEach((t) => ids.push(t.id));
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}

export const getThreadMeta = (token: string, id: string) =>
  get<GmailThread>(token, `/threads/${id}`, { format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });

export const getThreadFull = (token: string, id: string) => get<GmailThread>(token, `/threads/${id}`, { format: "full" });

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
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ");
}

/** Run async work over items with a small concurrency limit (Gmail rate limits are per user). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const threadUrl = (threadId: string, account?: string) =>
  `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : "u/0/"}#all/${threadId}`;
