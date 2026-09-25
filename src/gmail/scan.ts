import { classify, normCompany, type Classified } from "./classify";
import { cancelPendingRequests, getMessageBody, getMessageMeta, header, listMessageIds, mapLimit, plainBody, resetRequestCount, getRequestCount, threadUrl, type GmailMessage } from "./api";
import { db, getKV, setKV } from "../db";
import { isForward, laterStage, STAGE_LABEL } from "../stages";
import { evaluateJob, extractJobInfo, extractTitle, type JobInfo } from "../jobs/evaluate";
import type { JobPreferences } from "../jobs/preferences";
import { scanLog } from "../lib/log";
import type { AppChanges, Application, EmailInput, ScanSummary, Settings, Suggestion } from "../types";

/**
 * Gmail search that narrows candidates on Google's side. One messages.list call
 * costs the same whatever the query length, so a single focused query with a
 * date bound beats several smaller queries.
 */
export const RECRUITING_QUERY =
  '-category:promotions -category:social -in:sent -in:chats (subject:(application OR applying OR applied OR assessment OR interview OR candidacy OR offer OR "next steps") OR "thank you for applying" OR "thank you for your application" OR "online assessment" OR "video interview" OR unfortunately)';

/** Most bodies we'll fetch in one scan (only for vague emails or jobs with no visible title). */
export const MAX_BODY_FETCHES = 15;
/** Clicking Scan again within this window shows the cached result instead of calling Gmail. */
export const CACHE_WINDOW_MS = 2 * 60 * 1000;

export interface ClassifiedEmail {
  email: EmailInput;
  c: Classified;
  url: string;
  msgId?: string;
  job?: JobInfo;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const fmt = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

function summarise(c: { status: Application["status"]; dueOn: string }, email: EmailInput, isUpdate: boolean): string {
  const when = fmt(email.date);
  switch (c.status) {
    case "offer":
      return `Offer email on ${when}. Open it to check the details.`;
    case "rejected":
      return `Rejection email on ${when}.`;
    case "interview":
      return `Interview invite on ${when}.`;
    case "oa_done":
      return `Assessment marked complete on ${when}.`;
    case "oa_todo":
      return `Assessment invite on ${when}${c.dueOn ? `, due about ${fmt(c.dueOn)}` : ""}.`;
    default:
      return isUpdate ? `Application confirmation on ${when}.` : `Application received on ${when}.`;
  }
}

function findApp(apps: Application[], company: string, role: string): Application | null {
  const c = normCompany(company);
  if (!c) return null;
  const same = apps.filter((a) => !a.example && normCompany(a.company) === c);
  if (!same.length) return null;
  const r = role.toLowerCase();
  if (r) return same.find((a) => a.role.toLowerCase() === r) || same.find((a) => !a.role) || (same.length === 1 && !same[0].role ? same[0] : null);
  return same.length === 1 ? same[0] : null;
}

/**
 * Pure step: fold classified emails into suggestions against the current tracker.
 * Emails about the same company (and role) become one suggestion. When `prefs`
 * is given, each job goes through the Job Preferences filter and only relevant
 * ones are returned; the rest are reported through `onSkip`.
 */
export function buildSuggestions(
  items: ClassifiedEmail[],
  apps: Application[],
  now = Date.now(),
  opts: { prefs?: JobPreferences; onSkip?: (s: { company: string; title: string; reason: string }) => void } = {},
): Suggestion[] {
  const roleOf = (i: ClassifiedEmail) => i.c.role || i.job?.title || "";
  const relevant = items.filter((i) => i.c.relevant && i.c.company).sort((a, b) => a.email.date.localeCompare(b.email.date));

  // group by company, then split by role when one company has several named roles
  const byCompany = new Map<string, ClassifiedEmail[]>();
  for (const i of relevant) {
    const k = normCompany(i.c.company);
    byCompany.set(k, [...(byCompany.get(k) || []), i]);
  }
  const groups: ClassifiedEmail[][] = [];
  for (const list of byCompany.values()) {
    const roles = [...new Set(list.map((i) => roleOf(i).toLowerCase()).filter(Boolean))];
    if (roles.length <= 1) {
      groups.push(list);
      continue;
    }
    const byRole = new Map<string, ClassifiedEmail[]>(roles.map((r) => [r, []]));
    let lastRole = roles[0];
    for (const i of list) {
      const r = roleOf(i).toLowerCase() || lastRole;
      lastRole = r;
      byRole.get(r)!.push(i);
    }
    groups.push(...byRole.values());
  }

  const out: Suggestion[] = [];
  for (const g of groups) {
    const latest = g[g.length - 1];
    let status = g[0].c.status;
    for (const i of g.slice(1)) status = laterStage(status, i.c.status);
    const role = [...g].reverse().map(roleOf).find(Boolean) || "";
    const company = latest.c.company;
    const appliedEmail = g.find((i) => i.c.status === "applied");
    const appliedOn = appliedEmail?.email.date || "";
    const oaDone = g.some((i) => i.c.status === "oa_done");
    const todo = [...g].reverse().find((i) => i.c.status === "oa_todo");
    const dueOn = status === "oa_todo" ? todo?.c.dueOn || "" : "";
    const nextStep = status === "oa_todo" || status === "interview" ? [...g].reverse().find((i) => i.c.status === status)?.c.nextStep || "" : "";
    const confidence = g.some((i) => i.c.confidence === "unsure") && latest.c.confidence === "unsure" ? "unsure" : "sure";

    const match = findApp(apps, company, role);

    // Job Preferences filter
    let evaluation: ReturnType<typeof evaluateJob> | null = null;
    let info: JobInfo | null = null;
    if (opts.prefs) {
      const head = g.flatMap((i) => [i.email.subject, i.email.snippet]);
      const body = g.map((i) => i.email.body || "").join("\n");
      info = extractJobInfo(head, body, role);
      evaluation = evaluateJob({ company, info, subject: head.join("\n"), body, tracked: !!match }, opts.prefs);
      if (!evaluation.include) {
        opts.onSkip?.({ company, title: info.title, reason: evaluation.reason });
        continue;
      }
    }
    const title = role || info?.title || "";

    const changes: AppChanges = {};
    if (match) {
      if (isForward(match.status, status)) changes.status = status;
      if (!match.role && title) changes.role = title;
      if (!match.appliedOn && appliedOn) changes.appliedOn = appliedOn;
      if (oaDone && !match.oaDone) changes.oaDone = true;
      if (changes.status === "oa_todo" || changes.status === "interview") {
        if (nextStep) changes.nextStep = nextStep;
        if (dueOn) changes.dueOn = dueOn;
      }
      if (!Object.keys(changes).length) continue; // nothing new for this row
    } else {
      Object.assign(changes, { company, role: title, status, appliedOn, oaDone });
      if (nextStep) changes.nextStep = nextStep;
      if (dueOn) changes.dueOn = dueOn;
      if (info?.url) changes.link = info.url;
    }

    const s: Suggestion = {
      id: `g-${latest.msgId || latest.email.threadId}`,
      kind: match ? "update" : "new",
      appId: match?.id,
      company: match?.company || company,
      summary: summarise({ status: changes.status ?? status, dueOn }, latest.email, !!match),
      changes,
      emailDate: latest.email.date,
      emailSubject: latest.email.subject,
      emailFrom: latest.email.from,
      emailUrl: latest.url,
      threadIds: [...new Set(g.map((i) => i.email.threadId))],
      confidence,
      state: "pending",
      createdAt: now,
    };
    if (evaluation && evaluation.label !== "none") {
      s.match = evaluation.label;
      s.matchScore = evaluation.score;
      s.matchReason = evaluation.reason;
      s.category = evaluation.category;
    }
    if (info) {
      if (info.title) s.jobTitle = info.title;
      if (info.employment.length) s.employment = info.employment;
      if (info.location) s.location = info.location;
      if (info.url) s.jobUrl = info.url;
    }
    out.push(s);
  }
  return out;
}

function toEmail(m: GmailMessage): EmailInput {
  const ms = Number(m.internalDate) || Date.parse(header(m, "Date")) || Date.now();
  return {
    threadId: m.threadId,
    from: header(m, "From"),
    subject: decodeEntities(header(m, "Subject")),
    snippet: decodeEntities(m.snippet || ""),
    date: new Date(ms).toISOString().slice(0, 10),
  };
}

export class ScanBusyError extends Error {
  constructor() {
    super("A Gmail scan is already running.");
    this.name = "ScanBusyError";
  }
}

let scanRunning = false;
export const isScanRunning = () => scanRunning;

/**
 * Search, read, classify and queue suggestions. Writes only to this browser's database.
 *
 * API use per scan: 1 messages.list (≤ maxEmails ids) + 1 metadata get per message
 * not seen before + at most MAX_BODY_FETCHES body gets. Every fetched message is
 * cached locally straight away, so a scan that stops part-way (for example on a
 * rate limit) never re-downloads what it already has.
 */
export async function runScan(
  token: string,
  settings: Settings,
  account: string,
  onProgress: (msg: string) => void,
): Promise<ScanSummary> {
  if (scanRunning) throw new ScanBusyError();
  scanRunning = true;
  resetRequestCount();
  try {
    scanLog("Gmail scan started");
    const lastScanAt = await getKV<number>("lastScanAt", 0);
    const startMs = lastScanAt ? lastScanAt - 86_400_000 : Date.now() - settings.firstScanDays * 86_400_000;
    const d = new Date(startMs);
    const after = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

    onProgress("Scanning Gmail…");
    const refs = await listMessageIds(token, `after:${after} ${RECRUITING_QUERY}`, settings.maxEmails);
    scanLog(`Gmail search completed: ${refs.length} candidates`);

    // Deduplicate against every message this browser has already fetched.
    const known = await db.processedMessages.bulkGet(refs.map((r) => r.id));
    const cachedPending = known.filter((k): k is NonNullable<typeof k> => !!k && !k.done && !!k.meta);
    const fresh = refs.filter((_, i) => !known[i]);
    const skippedKnown = refs.length - fresh.length - cachedPending.length;
    if (skippedKnown > 0) scanLog(`Skipped ${skippedKnown} already processed message(s)`);
    if (cachedPending.length) scanLog(`Reusing ${cachedPending.length} message(s) fetched by an unfinished scan`);

    onProgress(fresh.length ? "Looking for relevant job applications…" : "Checking for new job emails…");
    const me = account.toLowerCase();
    type Entry = { id: string; email: EmailInput; url: string };
    const entries: Entry[] = cachedPending.map((k) => ({ id: k.id, email: k.meta!, url: k.url || threadUrl(k.meta!.threadId, account) }));
    await mapLimit(fresh, 2, async (r, i) => {
      scanLog(`Fetching metadata for candidate ${i + 1}/${fresh.length}`);
      const m = await getMessageMeta(token, r.id);
      const email = toEmail(m);
      const url = threadUrl(m.threadId, account);
      const fromMe = !!me && email.from.toLowerCase().includes(me);
      await db.processedMessages.put({ id: r.id, at: Date.now(), done: fromMe, meta: fromMe ? undefined : email, url });
      if (!fromMe) entries.push({ id: r.id, email, url });
      if ((i + 1) % 10 === 0) onProgress(`Looking for relevant job applications… ${i + 1} of ${fresh.length}`);
    });

    const apps = await db.applications.toArray();
    const items: ClassifiedEmail[] = [];
    const needBody: { entry: Entry; priority: number }[] = [];
    for (const e of entries) {
      const c = classify(e.email, []);
      if (e.email.body !== undefined) {
        items.push({ email: e.email, c, url: e.url, msgId: e.id, job: extractJobInfo([e.email.subject, e.email.snippet], e.email.body, c.role) });
        continue;
      }
      if (c.needsBody) {
        needBody.push({ entry: e, priority: 0 });
        continue;
      }
      items.push({ email: e.email, c, url: e.url, msgId: e.id, job: extractJobInfo([e.email.subject, e.email.snippet], "", c.role) });
      // A new job with no visible title: read the body so the role can be checked.
      const tracked = c.company && apps.some((a) => !a.example && normCompany(a.company) === normCompany(c.company));
      if (c.relevant && !tracked && !c.role && !extractTitle([e.email.subject, e.email.snippet])) needBody.push({ entry: e, priority: 1 });
    }

    const toFetch = needBody.sort((a, b) => a.priority - b.priority).slice(0, MAX_BODY_FETCHES);
    if (toFetch.length) onProgress(`Reading ${toFetch.length} email${toFetch.length > 1 ? "s" : ""} in more detail…`);
    await mapLimit(toFetch, 2, async ({ entry }, i) => {
      scanLog(`Fetching body ${i + 1}/${toFetch.length}`);
      const full = await getMessageBody(token, entry.id);
      const body = plainBody(full).slice(0, 4000);
      const email = { ...entry.email, body };
      await db.processedMessages.update(entry.id, { meta: email });
      const c = classify(email, []);
      const idx = items.findIndex((x) => x.msgId === entry.id);
      const item = { email, c, url: entry.url, msgId: entry.id, job: extractJobInfo([email.subject, email.snippet], body, c.role) };
      if (idx >= 0) items[idx] = item;
      else items.push(item);
    });
    // Vague emails we couldn't read this time are still classified from the preview.
    for (const { entry } of needBody.slice(MAX_BODY_FETCHES)) {
      if (!items.some((x) => x.msgId === entry.id)) {
        const c = classify(entry.email, []);
        items.push({ email: entry.email, c, url: entry.url, msgId: entry.id, job: extractJobInfo([entry.email.subject, entry.email.snippet], "", c.role) });
      }
    }

    let skippedByPrefs = 0;
    const suggestions = buildSuggestions(items, apps, Date.now(), { prefs: settings.jobPrefs, onSkip: () => skippedByPrefs++ });

    // Don't resurrect suggestions the user already accepted or dismissed.
    const existing = await db.suggestions.bulkGet(suggestions.map((s) => s.id));
    const toSave = suggestions.filter((_, i) => !existing[i] || existing[i]!.state === "pending");

    const summary: ScanSummary = {
      at: Date.now(),
      checked: entries.length,
      relevant: toSave.map((s) => ({ title: s.changes.role || s.jobTitle || "", company: s.company, match: s.match || "" })),
      skippedByPrefs,
      skippedOther: items.filter((i) => !i.c.relevant).length,
    };
    await db.transaction("rw", db.suggestions, db.processedMessages, db.kv, async () => {
      if (toSave.length) await db.suggestions.bulkPut(toSave);
      const ids = entries.map((e) => e.id);
      await db.processedMessages.bulkUpdate(ids.map((key) => ({ key, changes: { done: true } })));
      await setKV("lastScanAt", summary.at);
      await setKV("lastScanSummary", summary);
    });
    scanLog(`Gmail scan completed: ${toSave.length} relevant job(s), ${getRequestCount()} Gmail request(s)`);
    return summary;
  } finally {
    cancelPendingRequests();
    scanRunning = false;
  }
}

/** Forget which emails were read, so the next scan looks at everything in the window again. */
export async function resetScanHistory(): Promise<void> {
  await Promise.all([db.processedMessages.clear(), db.handled.clear(), setKV("lastScanAt", 0), setKV("lastScanSummary", null)]);
}

/** Human label for what a suggestion changes, e.g. "→ Rejected · due 28 Sep". */
export function describeChanges(s: Suggestion): string {
  const bits: string[] = [];
  if (s.changes.status) bits.push(`→ ${STAGE_LABEL[s.changes.status]}`);
  if (s.changes.dueOn) bits.push(`due ${fmt(s.changes.dueOn)}`);
  return bits.join(" · ");
}

/** Apply an accepted suggestion to the tracker. */
export async function acceptSuggestion(s: Suggestion, makeId: (company: string) => string): Promise<void> {
  await db.transaction("rw", db.applications, db.suggestions, async () => {
    const apps = await db.applications.toArray();
    const target = (s.appId && apps.find((a) => a.id === s.appId)) || findApp(apps, s.changes.company || s.company, s.changes.role || "");
    const now = Date.now();
    if (target) {
      const next: Application = { ...target, updatedAt: now };
      const ch = s.changes;
      if (ch.status && isForward(target.status, ch.status)) next.status = ch.status;
      if (ch.role && !target.role) next.role = ch.role;
      if (ch.appliedOn && !target.appliedOn) next.appliedOn = ch.appliedOn;
      if (ch.oaDone) next.oaDone = true;
      if (ch.nextStep) next.nextStep = ch.nextStep;
      if (ch.dueOn) next.dueOn = ch.dueOn;
      if (ch.notes && !target.notes.includes(ch.notes)) next.notes = target.notes ? `${target.notes}\n${ch.notes}` : ch.notes;
      if (next.status === "oa_done") next.oaDone = true;
      await db.applications.put(next);
    } else {
      const ch = s.changes;
      await db.applications.put({
        id: makeId(ch.company || s.company),
        company: ch.company || s.company,
        role: ch.role || "",
        status: ch.status || "applied",
        oaDone: !!ch.oaDone || ch.status === "oa_done",
        appliedOn: ch.appliedOn || "",
        nextStep: ch.nextStep || "",
        dueOn: ch.dueOn || "",
        link: "",
        notes: ch.notes || "",
        updatedAt: now,
      });
    }
    await db.suggestions.update(s.id, { state: "accepted", decidedAt: now });
  });
}

export const dismissSuggestion = (s: Suggestion) => db.suggestions.update(s.id, { state: "dismissed", decidedAt: Date.now() });
