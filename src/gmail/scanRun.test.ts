import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { __setTiming, getRequestCount } from "./api";
import { RATE_LIMIT_MESSAGE, classifyGmailError, gmailErrorMessage, GmailError } from "./errors";
import { ScanBusyError, runScan } from "./scan";
import { db } from "../db";
import { defaultJobPreferences } from "../jobs/preferences";
import type { Settings } from "../types";

// ---------- a tiny fake Gmail ----------
interface FakeMsg { id: string; threadId: string; from: string; subject: string; snippet: string; date: string }
let mailbox: FakeMsg[] = [];
let calls: string[] = [];
let gate: Promise<void> | null = null;
let failWith: { status: number; body: unknown; times: number } | null = null;

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input));
  const path = url.pathname.replace("/gmail/v1/users/me", "");
  calls.push(path + (url.searchParams.get("format") ? `?${url.searchParams.get("format")}` : ""));
  const run = async () => {
    if (gate) await gate;
    if (failWith && failWith.times > 0) {
      failWith.times--;
      return new Response(JSON.stringify(failWith.body), { status: failWith.status, headers: { "Content-Type": "application/json" } });
    }
    if (path === "/messages") {
      const max = Number(url.searchParams.get("maxResults"));
      return Response.json({ messages: mailbox.slice(0, max).map((m) => ({ id: m.id, threadId: m.threadId })) });
    }
    const id = path.split("/")[2];
    const m = mailbox.find((x) => x.id === id)!;
    if (url.searchParams.get("format") === "full") {
      return Response.json({ id: m.id, threadId: m.threadId, payload: { mimeType: "text/plain", body: { data: b64(m.snippet) } } });
    }
    return Response.json({
      id: m.id,
      threadId: m.threadId,
      internalDate: String(Date.parse(m.date)),
      snippet: m.snippet,
      payload: { headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }] },
    });
  };
  return run();
}

const settings = (): Settings => ({ clientId: "1-a.apps.googleusercontent.com", firstScanDays: 30, maxEmails: 50, jobPrefs: defaultJobPreferences() });

const MAILBOX: FakeMsg[] = [
  { id: "m1", threadId: "t1", from: "Northwind Careers <careers@northwind.com>", subject: "Thank you for applying to Northwind", snippet: "Thank you for your application for the Graduate Software Engineer position.", date: "2026-09-20" },
  { id: "m2", threadId: "t2", from: "recruit777@rgis.com", subject: "Thank you for applying", snippet: "Dear Sam, Thank you for applying for the Full and Part Time Stock Taker position.", date: "2026-09-21" },
  { id: "m3", threadId: "t3", from: "Lumen Health <jobs@lumenhealth.com>", subject: "Your application", snippet: "We have received your application for the Data Analyst role.", date: "2026-09-22" },
  { id: "m4", threadId: "t4", from: "jobalerts-noreply@linkedin.com", subject: "10 new jobs for you", snippet: "Top jobs matching your profile", date: "2026-09-22" },
];

beforeAll(() => {
  __setTiming({ sleep: async () => {}, minIntervalMs: 0, retryDelaysMs: [1, 2, 4] });
});
beforeEach(async () => {
  mailbox = [...MAILBOX];
  calls = [];
  gate = null;
  failWith = null;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  await Promise.all([db.applications.clear(), db.suggestions.clear(), db.processedMessages.clear(), db.kv.clear()]);
});
afterEach(() => vi.unstubAllGlobals());

describe("runScan", () => {
  it("suggests the relevant jobs and filters out the stock taker and job alerts", async () => {
    const summary = await runScan("tok", settings(), "sam@example.com", () => {});
    const names = summary.relevant.map((r) => r.company).sort();
    expect(names).toEqual(["Lumen Health", "Northwind"]);
    expect(summary.skippedByPrefs).toBe(1);
    const saved = await db.suggestions.toArray();
    expect(saved.every((s) => s.state === "pending")).toBe(true); // nothing is added without approval
    expect(await db.applications.count()).toBe(0);
  });

  it("uses 1 list call + 1 metadata call per message and no thread downloads", async () => {
    await runScan("tok", settings(), "", () => {});
    expect(calls.filter((c) => c === "/messages")).toHaveLength(1);
    expect(calls.filter((c) => c.endsWith("?metadata"))).toHaveLength(4);
    expect(calls.some((c) => c.startsWith("/threads"))).toBe(false);
    expect(getRequestCount()).toBe(5);
  });

  it("21. never fetches the same Gmail message twice", async () => {
    await runScan("tok", settings(), "", () => {});
    calls = [];
    mailbox.unshift({ id: "m5", threadId: "t1", from: "Northwind Careers <careers@northwind.com>", subject: "Update", snippet: "Unfortunately we will not be progressing your application.", date: "2026-09-24" });
    await runScan("tok", settings(), "", () => {});
    const metadata = calls.filter((c) => c.endsWith("?metadata"));
    expect(metadata).toEqual(["/messages/m5?metadata"]); // m1-m4 were not requested again
    expect(calls.filter((c) => /m[1-4]\?/.test(c))).toHaveLength(0);
  });

  it("22. a second scan can't start while one is running", async () => {
    let release!: () => void;
    gate = new Promise<void>((r) => (release = r));
    const first = runScan("tok", settings(), "", () => {});
    await expect(runScan("tok", settings(), "", () => {})).rejects.toBeInstanceOf(ScanBusyError);
    release();
    await first;
    // and a new scan works once the first has finished
    await expect(runScan("tok", settings(), "", () => {})).resolves.toBeTruthy();
  });

  it("23. retries a quota error a few times with backoff, then reports it clearly", async () => {
    const quota = { error: { code: 429, message: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'", status: "RESOURCE_EXHAUSTED", errors: [{ reason: "rateLimitExceeded" }] } };
    failWith = { status: 429, body: quota, times: 99 };
    const err = await runScan("tok", settings(), "", () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(GmailError);
    expect(err.kind).toBe("rate_limit");
    expect(gmailErrorMessage(err)).toBe(RATE_LIMIT_MESSAGE);
    expect(gmailErrorMessage(err)).not.toMatch(/enabled/i);
    expect(calls).toHaveLength(4); // first try + 3 retries, then stop
  });

  it("recovers when a quota error clears within the retries", async () => {
    failWith = { status: 403, body: { error: { code: 403, message: "User Rate Limit Exceeded", errors: [{ reason: "userRateLimitExceeded" }] } }, times: 2 };
    const summary = await runScan("tok", settings(), "", () => {});
    expect(summary.relevant.length).toBe(2);
  });

  it("keeps what an interrupted scan fetched, so the next scan doesn't refetch it", async () => {
    // First two metadata calls succeed, then Gmail refuses everything.
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.includes("/messages/") && ++n > 2) {
        calls.push("blocked");
        return new Response(JSON.stringify({ error: { code: 429, message: "Too many requests" } }), { status: 429 });
      }
      return fakeFetch(input);
    }));
    await runScan("tok", settings(), "", () => {}).catch(() => {});
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
    calls = [];
    const summary = await runScan("tok", settings(), "", () => {});
    expect(calls.filter((c) => c.startsWith("/messages/"))).toHaveLength(2); // only the two it never got
    expect(summary.relevant.length).toBe(2);
  });
});

describe("error classification", () => {
  it("only says 'API not enabled' when it really isn't", () => {
    expect(classifyGmailError(403, "accessNotConfigured", "Gmail API has not been used in project 123 before or it is disabled")).toBe("api_disabled");
    expect(classifyGmailError(403, "", "Quota exceeded for quota metric 'Total Query Cost'")).toBe("rate_limit");
    expect(classifyGmailError(403, "userRateLimitExceeded", "User Rate Limit Exceeded")).toBe("rate_limit");
    expect(classifyGmailError(429, "", "Too Many Requests")).toBe("rate_limit");
    expect(classifyGmailError(401, "", "Invalid Credentials")).toBe("auth");
  });
});

describe("24. existing data is safe when preferences change", () => {
  it("keeps applications and their ids, and migrates old settings without losing the client ID", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    // v1.0 settings shape
    store.set("jat-settings-v1", JSON.stringify({ clientId: "123-abc.apps.googleusercontent.com", skipKeywords: ["night shift"], firstScanDays: 60 }));
    store.set("unrelated-key", "keep me");
    await db.applications.put({ id: "acme-x1y2z", company: "Acme", role: "Software Engineer", status: "interview", oaDone: true, appliedOn: "2026-09-01", nextStep: "", dueOn: "", link: "", notes: "mine", updatedAt: 1 });

    const { loadSettings, saveSettings } = await import("../settings");
    const s = loadSettings();
    expect(s.clientId).toBe("123-abc.apps.googleusercontent.com");
    expect(s.firstScanDays).toBe(60);
    expect(s.jobPrefs.excludedKeywords).toContain("night shift");

    saveSettings({ ...s, jobPrefs: { ...s.jobPrefs, preferredCompanies: ["Microsoft"], onlyPreferredCompanies: true } });
    const again = loadSettings();
    expect(again.jobPrefs.preferredCompanies).toEqual(["Microsoft"]);
    expect(again.clientId).toBe("123-abc.apps.googleusercontent.com");
    expect(store.get("unrelated-key")).toBe("keep me");

    const app = await db.applications.get("acme-x1y2z");
    expect(app).toMatchObject({ company: "Acme", status: "interview", notes: "mine" });
    expect(await db.applications.count()).toBe(1);
  });
});
