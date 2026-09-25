import { classify, normCompany, type Classified } from "./classify";
import { getThreadFull, getThreadMeta, header, mapLimit, plainBody, searchThreadIds, threadUrl, type GmailMessage } from "./api";
import { db, getKV, setKV } from "../db";
import { isForward, laterStage, STAGE_LABEL } from "../stages";
import type { AppChanges, Application, EmailInput, Settings, Suggestion } from "../types";

/** Gmail search that catches most recruiting mail while skipping promotions. */
export const RECRUITING_QUERY =
  '-category:promotions -category:social -in:sent (subject:(application OR applying OR applied OR assessment OR interview OR candidacy OR offer OR "next steps") OR "thank you for applying" OR "thank you for your application" OR "online assessment" OR "video interview" OR unfortunately)';

export interface ClassifiedEmail {
  email: EmailInput;
  c: Classified;
  url: string;
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
 * Emails about the same company (and role) become one suggestion.
 */
export function buildSuggestions(items: ClassifiedEmail[], apps: Application[], now = Date.now()): Suggestion[] {
  const relevant = items.filter((i) => i.c.relevant && i.c.company).sort((a, b) => a.email.date.localeCompare(b.email.date));

  // group by company, then split by role when one company has several named roles
  const byCompany = new Map<string, ClassifiedEmail[]>();
  for (const i of relevant) {
    const k = normCompany(i.c.company);
    byCompany.set(k, [...(byCompany.get(k) || []), i]);
  }
  const groups: ClassifiedEmail[][] = [];
  for (const list of byCompany.values()) {
    const roles = [...new Set(list.map((i) => i.c.role.toLowerCase()).filter(Boolean))];
    if (roles.length <= 1) {
      groups.push(list);
      continue;
    }
    const byRole = new Map<string, ClassifiedEmail[]>(roles.map((r) => [r, []]));
    let lastRole = roles[0];
    for (const i of list) {
      const r = i.c.role.toLowerCase() || lastRole;
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
    const role = [...g].reverse().find((i) => i.c.role)?.c.role || "";
    const company = latest.c.company;
    const appliedEmail = g.find((i) => i.c.status === "applied");
    const appliedOn = appliedEmail?.email.date || "";
    const oaDone = g.some((i) => i.c.status === "oa_done");
    const todo = [...g].reverse().find((i) => i.c.status === "oa_todo");
    const dueOn = status === "oa_todo" ? todo?.c.dueOn || "" : "";
    const nextStep = status === "oa_todo" || status === "interview" ? [...g].reverse().find((i) => i.c.status === status)?.c.nextStep || "" : "";
    const confidence = g.some((i) => i.c.confidence === "unsure") && latest.c.confidence === "unsure" ? "unsure" : "sure";

    const match = findApp(apps, company, role);
    const changes: AppChanges = {};
    if (match) {
      if (isForward(match.status, status)) changes.status = status;
      if (!match.role && role) changes.role = role;
      if (!match.appliedOn && appliedOn) changes.appliedOn = appliedOn;
      if (oaDone && !match.oaDone) changes.oaDone = true;
      if (changes.status === "oa_todo" || changes.status === "interview") {
        if (nextStep) changes.nextStep = nextStep;
        if (dueOn) changes.dueOn = dueOn;
      }
      if (!Object.keys(changes).length) continue; // nothing new for this row
    } else {
      Object.assign(changes, { company, role, status, appliedOn, oaDone });
      if (nextStep) changes.nextStep = nextStep;
      if (dueOn) changes.dueOn = dueOn;
    }

    out.push({
      id: `g-${latest.email.threadId}-${g.length}`,
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
    });
  }
  return out;
}

function toEmail(m: GmailMessage, threadId: string): EmailInput {
  const ms = Number(m.internalDate) || Date.parse(header(m, "Date")) || Date.now();
  return {
    threadId,
    from: header(m, "From"),
    subject: decodeEntities(header(m, "Subject")),
    snippet: decodeEntities(m.snippet || ""),
    date: new Date(ms).toISOString().slice(0, 10),
  };
}

export interface ScanResult {
  checked: number;
  suggestions: number;
  skipped: number;
}

/** Search, read, classify and queue suggestions. Writes only to this browser's database. */
export async function runScan(
  token: string,
  settings: Settings,
  account: string,
  onProgress: (msg: string) => void,
): Promise<ScanResult> {
  const lastScanAt = await getKV<number>("lastScanAt", 0);
  const startMs = lastScanAt ? lastScanAt - 86_400_000 : Date.now() - settings.firstScanDays * 86_400_000;
  const d = new Date(startMs);
  const after = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

  onProgress("Searching your inbox…");
  const ids = await searchThreadIds(token, `after:${after} ${RECRUITING_QUERY}`, 200);
  const handled = new Set((await db.handled.bulkGet(ids)).filter(Boolean).map((h) => h!.threadId));
  const fresh = ids.filter((id) => !handled.has(id));

  let done = 0;
  onProgress(fresh.length ? `Reading ${fresh.length} email thread${fresh.length > 1 ? "s" : ""}…` : "No new emails.");
  const me = account.toLowerCase();
  const perThread = await mapLimit(fresh, 5, async (id) => {
    const t = await getThreadMeta(token, id);
    done++;
    if (done % 10 === 0) onProgress(`Reading emails… ${done} of ${fresh.length}`);
    return (t.messages || [])
      .filter((m) => !me || !header(m, "From").toLowerCase().includes(me))
      .map((m) => ({ m, email: toEmail(m, id) }));
  });

  const items: ClassifiedEmail[] = [];
  const vague: { id: string; msgId: string; email: EmailInput }[] = [];
  for (const list of perThread) {
    for (const { m, email } of list) {
      const c = classify(email, settings.skipKeywords);
      if (c.needsBody) vague.push({ id: email.threadId, msgId: m.id, email });
      else items.push({ email, c, url: threadUrl(email.threadId, account) });
    }
  }

  if (vague.length) {
    onProgress(`Reading ${vague.length} unclear email${vague.length > 1 ? "s" : ""} in full…`);
    await mapLimit(vague, 4, async (v) => {
      const full = await getThreadFull(token, v.id);
      const msg = full.messages?.find((x) => x.id === v.msgId);
      const email = { ...v.email, body: msg ? plainBody(msg).slice(0, 4000) : "" };
      items.push({ email, c: classify(email, settings.skipKeywords), url: threadUrl(v.id, account) });
    });
  }

  const apps = await db.applications.toArray();
  const suggestions = buildSuggestions(items, apps);
  const now = Date.now();
  await db.transaction("rw", db.suggestions, db.handled, db.kv, async () => {
    if (suggestions.length) await db.suggestions.bulkPut(suggestions);
    await db.handled.bulkPut(fresh.map((threadId) => ({ threadId, at: now })));
    await setKV("lastScanAt", now);
  });

  return { checked: fresh.length, suggestions: suggestions.length, skipped: items.filter((i) => !i.c.relevant).length };
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
