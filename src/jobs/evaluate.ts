/**
 * Job extraction and relevance scoring.
 *
 * Pipeline per job (one company + role, possibly several emails):
 *   extract title / employment type / location / work mode / URL
 *   → excluded keywords → role categories → employment types
 *   → preferred companies (only if the toggle is on) → locations (only if enabled)
 *   → confidence score. Anything below 50 is never suggested.
 */
import { ROLE_CATEGORIES, type EmploymentType, type JobPreferences, type WorkMode } from "./preferences";

export interface JobInfo {
  title: string;
  employment: EmploymentType[];
  location: string;
  workMode: WorkMode | "";
  url: string;
}

export interface JobEvaluation {
  include: boolean;
  score: number;
  label: "strong" | "possible" | "tracked" | "none";
  category: string; // category label, "Custom keyword", "Tracked application" or "NON_TECHNICAL"
  reason: string;
}

// ---------- helpers ----------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, case-insensitive phrase match; spaces also match hyphens or slashes. */
export function hasPhrase(text: string, phrase: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  const body = esc(p.toLowerCase()).replace(/\\?[\s-]+/g, "[\\s\\-/]+");
  return new RegExp(`(?:^|[^a-z0-9])${body}(?:$|[^a-z0-9])`, "i").test(text);
}

const TECH_CONTEXT = /\b(?:software|technology|technical|tech|it|digital|data|computer|computing|cyber|cloud|developer|programming|systems? engineering|ai|machine learning)\b/i;
const squash = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// ---------- extraction ----------

const TITLE_PATTERNS: RegExp[] = [
  /(?:job title|position|role|vacancy)\s*[:\-–]\s*([^\n|]{3,90})/i,
  /(?:position|role) of ([^.,!:\n]{3,80}?)(?=\s*(?:[.,!\n(]|\bat\b|\bwith\b|$))/i,
  /(?:for|to|in) (?:the|our|a) ([^.,!:\n]{3,80}?) (?:position|role|opportunity|vacancy|job)\b/i,
  /(?:for|to|in) (?:the|our) ([^.,!:\n]{3,80}? (?:programme|program|scheme))\b/i,
  /application (?:for|to) (?:the |our |a )?([^.,!:\n]{3,80}?)(?=\s*(?:\bat\b|\bwith\b|\bposition\b|\brole\b|\bopportunity\b|[.,!\n(|]|$))/i,
  /applying (?:for|to) (?:the |our |a )?([^.,!:\n]{3,80}?)(?=\s*(?:\bat\b|\bwith\b|\bposition\b|\brole\b|[.,!\n(|]|$))/i,
  /^your application:\s*([^\n]{3,90}?)(?=\s+(?:ID\b|at\b)|$)/i,
  /^your application to ([^\n|]{3,90}?)(?=\s*(?:\||\bat\b|$))/i,
];

const TITLE_WORDS =
  /engineer|developer|analyst|graduate|intern|associate|scientist|consultant|programme|program|scheme|apprentice|designer|architect|manager|specialist|technolog|taker|assistant|operative|worker|cashier|cleaner|waiter|waitress|driver|guard|staff|member|porter|barista|bartender|representative|advisor|executive|officer|coordinator|administrator|sorter|picker|packer/i;

export function extractTitle(texts: string[]): string {
  for (const p of TITLE_PATTERNS) {
    for (const t of texts) {
      for (const line of t.split(/\n+/)) {
        const m = line.match(p);
        const v = m?.[1]?.replace(/\s+/g, " ").replace(/^[\s\-–:|,.'"]+|[\s\-–:|,.'"!]+$/g, "").trim();
        if (v && TITLE_WORDS.test(v) && v.split(" ").length <= 14) return v;
      }
    }
  }
  return "";
}

export function detectEmployment(text: string): EmploymentType[] {
  const t = text.toLowerCase();
  const out = new Set<EmploymentType>();
  const fullAndPart = /\bfull[\s-]*(?:and|&|\/|or)[\s-]*part[\s-]*time\b/.test(t);
  if (fullAndPart || /\bfull[\s-]?time\b|\bpermanent\b/.test(t)) out.add("FULL_TIME");
  if (fullAndPart || /\bpart[\s-]?time\b/.test(t)) out.add("PART_TIME");
  if (/\bintern(?:ship)?s?\b|\bsummer analyst\b|\bsummer internship\b/.test(t)) out.add("INTERNSHIP");
  if (/\bplacement\b|\byear in industry\b|\bindustrial placement\b/.test(t)) out.add("PLACEMENT");
  if (/\bgraduate\b|\bgrad scheme\b|\bearly careers?\b|\bcampus\b|\buniversity (?:hire|graduate)\b|\bnew grad\b/.test(t)) out.add("GRADUATE");
  if (/\bapprentice(?:ship)?\b/.test(t)) out.add("APPRENTICESHIP");
  if (/\bcontract(?:or)?\b(?! of employment)|\bfixed[\s-]term\b|\bfreelance\b|\btemporary\b|\btemp\b/.test(t)) out.add("CONTRACT");
  return [...out];
}

export function detectWorkMode(text: string): WorkMode | "" {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\b(?:fully |100% )?remote\b|\bwork from home\b|\bwfh\b/i.test(text)) return "remote";
  if (/\bon[\s-]?site\b|\bin[\s-]office\b|\bin[\s-]person\b/i.test(text)) return "onsite";
  return "";
}

const LOCATION_PATTERNS: RegExp[] = [
  /\blocation\s*[:\-–]\s*([A-Z][A-Za-z .,'\-]{2,40})/,
  /\((?:UK\s*[-–]\s*)?([A-Z][a-z]+(?:[ -][A-Z][a-z]+)?)\)/,
  /\s[-–]\s([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?=\s*(?:[-–|(]|$))/,
  /\bbased in ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/,
  /\bin ([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?= office| area|, UK|, England)/,
];
const NOT_PLACE = /^(?:Graduate|Software|Engineer|Developer|Full|Part|Time|Campus|Application|Update|Team|Remote|Hybrid|Programme|Scheme|Associate|Analyst|Junior|Senior|Your|Thank|Stack)$/;

export function extractLocation(texts: string[]): string {
  for (const p of LOCATION_PATTERNS) {
    for (const t of texts) {
      const m = t.match(p);
      const v = m?.[1]?.trim().replace(/[.,]+$/, "");
      if (v && !v.split(/\s+/).some((w) => NOT_PLACE.test(w))) return v;
    }
  }
  return "";
}

export function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s<>"')]+(?:job|career|vacanc|position|apply|requisition)[^\s<>"')]*/i);
  return m ? m[0] : "";
}

/**
 * `head` = subjects and previews; `body` = full text when fetched.
 * Employment type and work mode come from the title and head only, so a footer
 * like "explore our internships" can't change how a job is filtered.
 */
export function extractJobInfo(head: string[], body = "", knownTitle = ""): JobInfo {
  const headText = head.join("\n");
  const bodyStart = body.slice(0, 2500);
  const title = knownTitle || extractTitle(head) || (bodyStart ? extractTitle([bodyStart]) : "");
  return {
    title,
    employment: detectEmployment(`${title}\n${headText}`),
    location: extractLocation([title, ...head, bodyStart]),
    workMode: detectWorkMode(`${title}\n${headText}`),
    url: extractUrl(`${headText}\n${body}`),
  };
}

// ---------- evaluation ----------

export interface JobContext {
  company: string;
  info: JobInfo;
  subject: string; // subjects + previews of the emails about this job
  body: string; // body text, when it was fetched
  tracked: boolean; // the company/role is already in the user's tracker
}

function matchRoles(text: string, prefs: JobPreferences): { category: string; role: string } | null {
  if (!text) return null;
  for (const c of ROLE_CATEGORIES) {
    const selected = new Set(prefs.roles[c.id] ?? c.roles.map((r) => r.id));
    for (const r of c.roles) {
      if (!selected.has(r.id)) continue;
      if (r.patterns.some((p) => hasPhrase(text, p))) {
        if (r.needsTechContext && !TECH_CONTEXT.test(text.replace(new RegExp(r.patterns.map(esc).join("|"), "ig"), " "))) continue;
        return { category: c.label, role: r.label };
      }
    }
  }
  const kw = prefs.customRoleKeywords.find((k) => hasPhrase(text, k));
  return kw ? { category: "Custom keyword", role: kw } : null;
}

export const isPreferredCompany = (company: string, prefs: JobPreferences) => {
  const c = squash(company);
  return !!c && prefs.preferredCompanies.some((p) => {
    const q = squash(p);
    return q.length >= 2 && (c === q || c.includes(q) || q.includes(c));
  });
};

const label = (score: number): JobEvaluation["label"] => (score >= 70 ? "strong" : score >= 50 ? "possible" : "none");

export function evaluateJob(ctx: JobContext, prefs: JobPreferences): JobEvaluation {
  const { info } = ctx;
  const titleAndSubject = `${info.title}\n${ctx.subject}`;
  const preferred = isPreferredCompany(ctx.company, prefs);

  // 1. Excluded job types always win (checked on title, subject and preview only,
  //    so footers like "we also hire warehouse staff" don't knock out a real match).
  const excluded = prefs.excludedKeywords.find((k) => hasPhrase(titleAndSubject, k));
  if (excluded && !ctx.tracked) {
    return { include: false, score: 0, label: "none", category: "NON_TECHNICAL", reason: `Matches excluded keyword "${excluded}"` };
  }

  // 2. Company filter (only when the user turned it on).
  if (prefs.onlyPreferredCompanies && !preferred && !ctx.tracked) {
    return { include: false, score: 0, label: "none", category: "", reason: "Not one of your preferred companies" };
  }

  // Updates to applications already in the tracker are always shown: the user chose to track them.
  if (ctx.tracked) {
    return { include: true, score: 85, label: "tracked", category: "Tracked application", reason: "Already in your tracker" };
  }

  // 3. Role category: title is strongest evidence, then subject/preview, then body.
  const inTitle = matchRoles(info.title, prefs);
  const inSubject = inTitle ? null : matchRoles(ctx.subject, prefs);
  const inBody = inTitle || inSubject ? null : matchRoles(ctx.body.slice(0, 3000), prefs);
  const role = inTitle || inSubject || inBody;

  // 4. Employment type: only filters when something was detected.
  if (info.employment.length && !info.employment.some((e) => prefs.employment.includes(e))) {
    return { include: false, score: 0, label: "none", category: role?.category ?? "", reason: `Employment type (${info.employment.join(", ").toLowerCase().replace(/_/g, "-")}) isn't selected` };
  }

  // 5. Location (optional). Unknown locations are allowed.
  if (prefs.locationFilter) {
    if (info.workMode && !prefs.workModes.includes(info.workMode)) {
      return { include: false, score: 0, label: "none", category: role?.category ?? "", reason: `${info.workMode} roles aren't selected` };
    }
    const locOk =
      !info.location ||
      !prefs.preferredLocations.length ||
      prefs.preferredLocations.some((l) => squash(info.location).includes(squash(l)) || squash(l).includes(squash(info.location))) ||
      (info.workMode === "remote" && prefs.workModes.includes("remote"));
    if (!locOk) return { include: false, score: 0, label: "none", category: role?.category ?? "", reason: `Location "${info.location}" isn't one of your locations` };
  }

  // 6. Confidence.
  let score = inTitle ? 90 : inSubject ? 75 : inBody ? 60 : preferred ? 55 : 30;
  if (role && preferred) score += 5;
  if (role && info.employment.some((e) => prefs.employment.includes(e))) score += 3;
  if (role && prefs.locationFilter && info.location) score += 2;
  score = Math.min(100, score);

  if (score < 50) {
    return { include: false, score, label: "none", category: "", reason: info.title ? `"${info.title}" doesn't match your selected roles` : "Couldn't tell which role this is" };
  }
  return {
    include: true,
    score,
    label: label(score),
    category: role?.category ?? "Preferred company",
    reason: role ? `Matches ${role.role}${inTitle ? "" : inSubject ? " (from the email subject)" : " (from the email text)"}` : "From a preferred company; role unclear",
  };
}
