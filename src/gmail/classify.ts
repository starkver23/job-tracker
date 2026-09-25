/**
 * Rules engine: turns one recruiting email into a structured guess.
 *
 * It is deliberately simple and transparent: keyword patterns for the
 * outcome, and a few extraction patterns for company, role and deadline.
 * Every guess goes to the user for review, so a clear "unsure" beats a
 * confident wrong answer.
 */
import type { EmailInput, Stage } from "../types";

export interface Classified {
  relevant: boolean;
  skipReason?: string;
  status: Stage;
  company: string;
  role: string;
  nextStep: string;
  dueOn: string;
  oaDone: boolean;
  confidence: "sure" | "unsure";
  /** True when the snippet alone was too vague and the full body should be read. */
  needsBody: boolean;
  signal: string; // short human reason, e.g. "rejection wording"
}

// ---------- outcome patterns (checked in this order) ----------

const OFFER = [
  /pleased to (?:make you an |extend (?:you )?an |)offer/i,
  /offer of employment/i,
  /(?:your|a) (?:job |formal |conditional )?offer (?:letter|from)/i,
  /delighted to offer you/i,
];

const REJECTED = [
  /unfortunately/i,
  /not (?:been )?successful/i,
  /(?:not|won't|will not) (?:be )?(?:progress|progressing|moving forward|move forward|taking your application)/i,
  /decided (?:not to|to move forward with other|to proceed with other|to pursue other)/i,
  /move forward with (?:other|another) candidate/i,
  /regret to inform/i,
  /(?:position|role|opening|vacancy) (?:has|have) (?:now |recently )?been (?:filled|closed)/i,
  /(?:position|role) is no longer available/i,
  /not (?:been )?selected/i,
  /unable to (?:progress|offer|move forward)/i,
  /candidates whose (?:skills|experience).{0,40}more closely/i,
  /(?:not|n't)[^.]{0,30}the right (?:match|fit)/i,
];

const OA_DONE = [
  /thank(?:s| you) for completing (?:the |your |our )?(?:online )?(?:assessment|test|video interview|coding)/i,
  /(?:online )?assessment[s]? (?:is |are )?complete\b/i,
  /completed (?:the |your )?(?:online )?assessment/i,
  /video interview complete/i,
];

/** "You haven't yet completed your assessment" is a reminder, not a completion. */
const NOT_DONE_YET = /(?:haven't|have not|not yet|yet to|still (?:need|awaiting)) (?:\w+ )?(?:complet|finish|submit)/i;

const INTERVIEW = [
  /invit(?:e|ation|ing) you (?:to|for) (?:an? |the |your )?(?:first[- ]round |second[- ]round |final |technical |in[- ]person |virtual )?interview/i,
  /interview invitation/i,
  /schedule (?:an? |your )?(?:first[- ]round |technical |final )?interview/i,
  /(?:book|choose|select) (?:a |your )?(?:time|slot) for (?:your|an|the) interview/i,
  /assessment cent(?:re|er)/i,
];

const OA_TODO = [
  /invit(?:e|ation|ing) (?:you )?to (?:complete|take|sit)/i,
  /(?:online|coding|technical|psychometric|situational judgement|game[- ]based) (?:assessment|test)/i,
  /complete (?:the |your |our )?(?:online )?(?:assessment|test|video interview)/i,
  /\b(?:hackerrank|codility|codesignal|hirevue|arctic shores|pymetrics|sova|cappfinity|aon assessment|testgorilla)\b/i,
  /video interview/i,
  /next stage of (?:the|our) (?:recruitment )?process is/i,
  /assessment invitation|invitation to (?:an? |the |our )?(?:online )?assessment|invited to (?:complete|take)/i,
];

const APPLIED = [
  /thank(?:s| you)(?: so much| very much)? for (?:your )?(?:recent )?(?:application|applying)/i,
  /(?:we(?:'ve| have)|we) (?:successfully )?received your (?:job )?application/i,
  /application (?:has been |was )?(?:successfully )?(?:received|submitted|sent)/i,
  /your application (?:to|for) .{2,80} (?:has been|was) (?:received|submitted)/i,
  /(?:confirm|confirming) (?:that )?(?:we(?:'ve| have) received )?your (?:job )?application/i,
  /application confirmation/i,
  /thank(?:s| you)[\s\-–—,]+we(?:'ve| have) received your/i,
];

// ---------- noise we never want as applications ----------

const NOISE = [
  /jobs? (?:you (?:haven't|have not) applied|that match|for you|alert|recommendation)/i,
  /(?:new|top|recommended) jobs\b/i,
  /job alert/i,
  /interview questions (?:recently )?asked/i,
  /your application was viewed/i,
  /webinar|newsletter|unsubscribe from this list/i,
  /apply early|application deadline is/i,
];
/** Checked against the part before "@" (e.g. jobalerts-noreply@linkedin.com). */
const NOISE_LOCAL = /jobalerts|jobmessenger|job-alerts|newsletter|marketing|digest|promo/i;
const NOISE_DOMAINS = /(?:^|\.)(?:em\.linkedin\.com|notification\.bebee\.com|tryexponent\.com|weworkremotely\.com|naukri\.com|uber\.com)$/i;

// ---------- company & role extraction ----------

/** Domains of hiring platforms and job boards: the sender is not the employer. */
const PLATFORM_DOMAIN = /(?:^|\.)(?:myworkday\.com|lever\.co|greenhouse\.io|greenhouse-mail\.io|ashbyhq\.com|smartrecruiters\.com|icims\.com|taleo\.net|successfactors\.(?:com|eu)|bamboohr\.com|teamtailor-mail\.com|teamtailor\.com|workablemail\.com|workable\.com|recruitee\.com|jobvite\.com|oracle\.com|oraclecloud\.com|linkedin\.com|wellfound\.com|indeed\.com|monsterindia\.com|monster\.com|harri\.com|hirevue\.com|mchire\.com|arcticshores\.com|aon-assessment\.com|hackerrank\.com|codility\.com|talently\.ai|scoutit\.co\.in|q-track\.co\.uk|gmail\.com|outlook\.com)$/i;

/** Pieces of a domain that never name the employer. */
const DOMAIN_NOISE = /^(?:jobalerts|alerts|campus|com|co|uk|org|net|io|ai|in|us|de|fr|eu|gov|ac|mail|email|apps|em|hr|people|talent|notification|notifications|recruitment|recruiting|careers?|jobs?|hire|workflow|cloud|us\d|eu\d|www|app|info|noreply|no-reply)$/i;

const GENERIC_DISPLAY = /\b(?:no-?reply|noreply|do not reply|careers?|recruit(?:ing|ment)?(?: team)?|talent(?: acquisition)?(?: team)?|hiring team|early careers|workday|notifications?|team|jobs?|hr)\b/gi;
const PLATFORM_DISPLAY = /^(?:workday|lever|greenhouse|ashby|smartrecruiters|icims|taleo|bamboohr|teamtailor|workable|linkedin|wellfound|indeed|monster|harri|hirevue|oracle|mail|email|support|hello|info|people)$/i;

function tidy(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|,.'"]+|[\s\-–—:|,.'"!]+$/g, "")
    .trim();
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const squash = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const nameFromToken = (t: string) => (t.length <= 4 ? t.toUpperCase() : titleCase(t));

function parseFrom(from: string): { display: string; local: string; domain: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  const addr = (m ? m[2] : from).trim().toLowerCase();
  const [local = "", domain = ""] = addr.split("@");
  return { display: m ? m[1].trim() : "", local, domain };
}

interface SenderInfo {
  display: string; // a usable employer name from the display name, or ""
  tokens: string[]; // employer-ish pieces of the domain, e.g. ["baesystems"]
  tenant: string; // Workday tenant from the local part (pwc@myworkday.com -> "pwc")
  platform: boolean;
}

function senderInfo(from: string): SenderInfo {
  const { display, local, domain } = parseFrom(from);
  const platform = PLATFORM_DOMAIN.test(domain);
  const cleaned = tidy(display.replace(GENERIC_DISPLAY, " ").replace(/\b(?:at|via|from)\b/gi, " "));
  const usableDisplay = cleaned.length > 1 && !PLATFORM_DISPLAY.test(cleaned) && !/@/.test(cleaned) ? cleaned : "";
  const tokens = domain
    .split(".")
    .flatMap((p) => p.split("-"))
    .map((p) => p.replace(/(?:careers?|jobs|recruitment|recruiting|talent)$/i, "").replace(/^(?:careers?|jobs|recruit)/i, ""))
    .filter((p) => p.length >= 2 && !DOMAIN_NOISE.test(p));
  const tenant = /myworkday\.com$/.test(domain) && local.length > 1 && !/^(?:no-?reply|careers?|jobs|recruit|talent|hr)/.test(local) ? local : "";
  return { display: platform && PLATFORM_DISPLAY.test(cleaned) ? "" : usableDisplay, tokens: platform ? [] : tokens, tenant, platform };
}

const W = "[A-Z][\\w&'’\\-]*(?:\\.[a-z]{2,4})?"; // a capitalised word, allowing "Wellfound.io"-style names
const STOP = "(?!(?:Job|Application|Video|Interview|Online|Assessment|Update|Status)\\b)";
const CO = `(${STOP}${W}(?: (?:&|and|of|de|${STOP}${W})){0,4})`;
const COMPANY_PATTERNS: RegExp[] = [
  new RegExp(`(?:[Aa]pplication|[Aa]pplying|[Aa]pplied) (?:to|at|with) (?:the )?${CO}`),
  new RegExp(`\\bat ${CO}`),
  new RegExp(`(?:interest in|joining|considering|a career (?:with|at)|career opportunities with|opportunities (?:at|with)|working (?:at|with|for)) ${CO}`),
  new RegExp(`^${CO}\\s*[-–—:|]\\s*(?:[Aa]pplication|[Yy]our [Aa]pplication|[Jj]ob [Aa]pplication|[Tt]hank)`),
  new RegExp(`^(?:[Yy]our )?${CO} (?:[Jj]ob [Aa]pplication|[Aa]pplication|[Vv]ideo [Ii]nterview|[Ii]nterview|[Aa]ssessment|[Oo]nline [Aa]ssessment)`),
  new RegExp(`[Aa]pplication\\s*[-–—|]\\s*${CO}\\s*$`),
  new RegExp(`${CO}['’]s (?:[\\w\\-]+ ){0,4}(?:role|position|programme|program|scheme|team|process)`),
  new RegExp(`^${CO}:`),
];

/** Words that can start a sentence but are never a company name. */
const NOT_A_COMPANY = /^(?:your|our|thank|thanks|we|the|a|an|hi|hello|dear|update|news|re|fwd|new|job|application|action|reminder|important|congratulations|unfortunately|please|next|campus|full|part|online|video|confirming|confirmation)\b/i;

const ROLE_PATTERNS: RegExp[] = [
  /(?:position|role) of ([^.,!:\n]{3,80}?)(?=\s*(?:[.,!\n(]|\bat\b|\bwith\b|$))/i,
  /(?:for|to|in) (?:the|our) ([^.,!:\n]{3,80}? (?:programme|program|scheme))\b/i,
  /(?:for|to|in) (?:the|our) ([^.,!:\n]{3,80}?) (?:position|role|opportunity|vacancy)\b/i,
  /application (?:for|to) (?:the |our )?([^.,!:\n]{3,80}?)(?=\s*(?:\bat\b|\bwith\b|\bposition\b|\brole\b|\bopportunity\b|[.,!\n(|]|$))/i,
  /applied (?:for|to) (?:the |our )?([^.,!:\n]{3,80}?)(?=\s*(?:\bat\b|\bwith\b|\bposition\b|\brole\b|[.,!\n(|]|$))/i,
  /interest in (?:the |our )?([^.,!:\n]{3,80}?) (?:position|role|opportunity)\b/i,
];

const ROLE_WORDS = /engineer|developer|analyst|graduate|intern|associate|scientist|consultant|programme|program|scheme|apprentice|designer|architect|manager|specialist|technolog/i;

function allMatches(patterns: RegExp[], texts: string[]): string[] {
  const out: string[] = [];
  for (const p of patterns) for (const t of texts) for (const line of t.split(/\n+/)) {
    const m = line.match(p);
    if (m?.[1]) out.push(tidy(m[1]));
  }
  return out;
}

function firstMatch(patterns: RegExp[], texts: string[], keep: (v: string) => boolean = () => true): string {
  return allMatches(patterns, texts).find(keep) || "";
}

/**
 * Pick the employer. Text candidates are cross-checked against the sender's
 * domain, so "at DHL Group" from dhl.com wins over a random capitalised phrase.
 */
function pickCompany(sender: SenderInfo, texts: string[]): { name: string; sure: boolean } {
  if (sender.display) return { name: sender.display, sure: true };
  const cands = [
    ...new Set(
      allMatches(COMPANY_PATTERNS, texts)
        .map((c) => c.replace(/['’]s$/, ""))
        .filter((c) => c.length > 1 && !NOT_A_COMPANY.test(c) && !ROLE_WORDS.test(c) && c.split(" ").length <= 5),
    ),
  ];
  // drop phrases that are really the start of a job title ("Junior Full Stack" + "Engineers")
  const joined = texts.join("\n");
  for (let i = cands.length - 1; i >= 0; i--) {
    const esc = cands[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const next = joined.match(new RegExp(`${esc}\\s+(\\w+)`));
    if (next && ROLE_WORDS.test(next[1])) cands.splice(i, 1);
  }
  const keys = [...sender.tokens, sender.tenant].filter(Boolean).map(squash);
  const agrees = (c: string) => keys.some((k) => k.length >= 2 && (squash(c).includes(k) || k.includes(squash(c))));
  const confirmed = cands.find(agrees);
  if (confirmed) return { name: confirmed, sure: true };
  if (cands.length) return { name: cands[0], sure: (sender.platform || !sender.tokens.length) && cands.length === 1 };
  if (sender.tokens.length) return { name: nameFromToken(sender.tokens[0]), sure: true };
  if (sender.tenant) return { name: nameFromToken(sender.tenant), sure: false };
  if (cands.length) return { name: cands[0], sure: false };
  return { name: "", sure: false };
}

// ---------- deadline ----------

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14 };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function findDeadline(text: string, emailDate: string): string {
  const within = text.match(/(?:within|you (?:only )?have|in the next)\s+(\d{1,2}|one|two|three|four|five|six|seven|ten|fourteen)\s+(?:calendar |working )?days/i);
  if (within && emailDate) {
    const n = Number(within[1]) || NUM_WORDS[within[1].toLowerCase()] || 0;
    if (n) return addDays(emailDate, n);
  }
  const by = text.match(/(?:by|before|deadline(?: is)?:?|no later than|until)\s+(?:\w+day,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/i);
  if (by && emailDate) {
    const day = Number(by[1]);
    const month = MONTHS.indexOf(by[2].toLowerCase());
    const baseYear = Number(emailDate.slice(0, 4));
    let year = by[3] ? Number(by[3]) : baseYear;
    let d = ymd(year, month, day);
    if (!by[3] && d < emailDate) d = ymd(++year, month, day);
    return d;
  }
  return "";
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- main ----------

const any = (ps: RegExp[], t: string) => ps.some((p) => p.test(t));

export function classify(email: EmailInput, skipKeywords: string[] = []): Classified {
  const head = `${email.subject}\n${email.snippet}`;
  const text = `${head}\n${email.body ?? ""}`;
  const lower = text.toLowerCase();
  const base: Classified = {
    relevant: false,
    status: "applied",
    company: "",
    role: "",
    nextStep: "",
    dueOn: "",
    oaDone: false,
    confidence: "sure",
    needsBody: false,
    signal: "",
  };

  const { local, domain } = parseFrom(email.from);
  if (NOISE_LOCAL.test(local) || NOISE_DOMAINS.test(domain) || any(NOISE, head)) return { ...base, skipReason: "job alert or newsletter" };
  const skip = skipKeywords.find((k) => k.trim() && lower.includes(k.trim().toLowerCase()));
  if (skip) return { ...base, skipReason: `mentions "${skip}"` };

  let status: Stage | null = null;
  let signal = "";
  if (any(OFFER, text)) [status, signal] = ["offer", "offer wording"];
  else if (any(REJECTED, text)) [status, signal] = ["rejected", "rejection wording"];
  else if (NOT_DONE_YET.test(text)) [status, signal] = ["oa_todo", "assessment reminder"];
  else if (any(OA_DONE, text)) [status, signal] = ["oa_done", "assessment completed"];
  else if (any(INTERVIEW, text)) [status, signal] = ["interview", "interview invite"];
  else if (any(OA_TODO, text)) [status, signal] = ["oa_todo", "assessment invite"];
  else if (any(APPLIED, text)) [status, signal] = ["applied", "application confirmation"];

  // Vague subject like "Update on your application" with no outcome words: read the body.
  const vague = /update|status|your application|news on/i.test(email.subject);
  if (!status && email.body && /^your application (?:to|for|was sent to)\b/i.test(email.subject)) [status, signal] = ["applied", "application confirmation"];
  if (!status) {
    if (vague && !email.body) return { ...base, relevant: true, needsBody: true, signal: "vague update" };
    return { ...base, skipReason: "no recruiting wording" };
  }

  const bodyStart = email.body ? [email.body.slice(0, 800)] : [];
  const picked = pickCompany(senderInfo(email.from), [email.subject, email.snippet, ...bodyStart]);
  const company = picked.name;

  let role = firstMatch(ROLE_PATTERNS, [email.subject, email.snippet, ...bodyStart], (v) => ROLE_WORDS.test(v) && v.split(" ").length <= 10).replace(/^[\w&.\- ]{2,40}['’]s\s+/, "");
  if (role && (!ROLE_WORDS.test(role) || role.split(" ").length > 10)) role = "";
  if (role && company && role.toLowerCase() === company.toLowerCase()) role = "";

  const dueOn = status === "oa_todo" ? findDeadline(text, email.date) : "";
  const nextStep =
    status === "oa_todo"
      ? /video interview|hirevue/i.test(text)
        ? "Complete video interview"
        : "Complete online assessment"
      : status === "interview"
        ? "Book or prepare for interview"
        : "";

  const confidence: Classified["confidence"] = !company || !picked.sure ? "unsure" : "sure";

  return {
    ...base,
    relevant: true,
    status,
    company: company ? titleCaseIfLower(company) : "",
    role,
    nextStep,
    dueOn,
    oaDone: status === "oa_done",
    confidence,
    signal,
  };
}

const titleCaseIfLower = (s: string) => (s === s.toLowerCase() ? titleCase(s) : s);

/** Normalise a company name for matching ("Bain & Company" == "bain and company"). */
export const normCompany = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|plc|inc|llc|group|uk|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
