/** Job preferences: what kinds of roles the Gmail scanner is allowed to suggest. */

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | "PLACEMENT" | "GRADUATE" | "APPRENTICESHIP";
export type WorkMode = "remote" | "hybrid" | "onsite";

export interface RoleCategory {
  id: string;
  label: string;
  roles: { id: string; label: string; patterns: string[]; needsTechContext?: boolean }[];
}

/**
 * Built-in role categories. `patterns` are matched as whole words, case-insensitive,
 * against the job title first, then the subject/preview/body with lower confidence.
 */
export const ROLE_CATEGORIES: RoleCategory[] = [
  {
    id: "software",
    label: "Software Engineering",
    roles: [
      { id: "swe", label: "Software Engineer", patterns: ["software engineer", "software engineering", "software eng"] },
      { id: "dev", label: "Software Developer", patterns: ["software developer", "software development"] },
      { id: "sde", label: "SDE", patterns: ["sde", "sde i", "sde 1", "software development engineer"] },
      { id: "swe-abbr", label: "SWE", patterns: ["swe"] },
      { id: "grad-swe", label: "Graduate Software Engineer", patterns: ["graduate software engineer", "graduate software developer", "software engineer graduate"] },
      { id: "fullstack", label: "Full Stack Developer", patterns: ["full stack", "full-stack", "fullstack"] },
      { id: "backend", label: "Backend Developer", patterns: ["backend", "back end", "back-end"] },
      { id: "frontend", label: "Frontend Developer", patterns: ["frontend", "front end", "front-end"] },
      { id: "web", label: "Web Developer", patterns: ["web developer", "web engineer"] },
      { id: "app", label: "Application / Mobile Developer", patterns: ["application engineer", "application developer", "mobile developer", "ios developer", "android developer", "javascript developer", "typescript developer"] },
    ],
  },
  {
    id: "ai",
    label: "AI / Machine Learning",
    roles: [
      { id: "ai-eng", label: "AI Engineer", patterns: ["ai engineer", "artificial intelligence engineer", "ai/ml", "ai & ml", "ai and ml"] },
      { id: "ml-eng", label: "Machine Learning Engineer", patterns: ["machine learning engineer", "machine learning"] },
      { id: "ml", label: "ML Engineer", patterns: ["ml engineer", "mle"] },
      { id: "ai-dev", label: "AI Developer", patterns: ["ai developer"] },
      { id: "applied-ai", label: "Applied AI Engineer", patterns: ["applied ai", "applied scientist"] },
      { id: "cv", label: "Computer Vision Engineer", patterns: ["computer vision"] },
      { id: "nlp", label: "NLP Engineer", patterns: ["nlp", "natural language processing"] },
      { id: "comp-sci", label: "Computational Science", patterns: ["computational science"] },
    ],
  },
  {
    id: "data",
    label: "Data",
    roles: [
      { id: "ds", label: "Data Scientist", patterns: ["data scientist", "data science"] },
      { id: "da", label: "Data Analyst", patterns: ["data analyst", "data analytics"] },
      { id: "ds-grad", label: "Machine Learning/Data Science Graduate", patterns: ["data science graduate", "machine learning graduate"] },
      { id: "de", label: "Data Engineer", patterns: ["data engineer", "data engineering"] },
      { id: "bi", label: "Business Intelligence", patterns: ["business intelligence", "bi analyst", "bi developer"] },
      { id: "ae", label: "Analytics Engineer", patterns: ["analytics engineer"] },
    ],
  },
  {
    id: "cloud",
    label: "Cloud / Infrastructure",
    roles: [
      { id: "cloud", label: "Cloud Engineer", patterns: ["cloud engineer", "cloud engineering"] },
      { id: "devops", label: "DevOps Engineer", patterns: ["devops", "dev ops"] },
      { id: "sre", label: "Site Reliability Engineer", patterns: ["site reliability", "sre"] },
      { id: "platform", label: "Platform Engineer", patterns: ["platform engineer"] },
      { id: "cloud-dev", label: "Cloud Developer", patterns: ["cloud developer"] },
      { id: "systems", label: "Systems Engineer", patterns: ["software systems engineer", "systems engineer"], needsTechContext: true },
    ],
  },
  {
    id: "security",
    label: "Cybersecurity",
    roles: [
      { id: "cyber", label: "Cybersecurity Engineer", patterns: ["cybersecurity", "cyber security", "cyber"] },
      { id: "sec-eng", label: "Security Engineer", patterns: ["security engineer"] },
      { id: "infosec", label: "Information Security", patterns: ["information security", "infosec"] },
      { id: "soc", label: "SOC Analyst", patterns: ["soc analyst"] },
      { id: "sec-analyst", label: "Security Analyst", patterns: ["security analyst"] },
    ],
  },
  {
    id: "consulting",
    label: "Technology Consulting",
    roles: [
      { id: "tech-consultant", label: "Technical Consultant", patterns: ["technical consultant"] },
      { id: "technology-consultant", label: "Technology Consultant", patterns: ["technology consultant", "technology consulting", "technology strategy", "tech insights"] },
      { id: "it-consultant", label: "IT Consultant", patterns: ["it consultant"] },
      { id: "solutions", label: "Solutions Engineer", patterns: ["solutions engineer", "solution engineer", "solutions architect"] },
      { id: "tech-analyst", label: "Technical Analyst", patterns: ["technical analyst", "technology analyst"] },
    ],
  },
  {
    id: "grad-tech",
    label: "Graduate Technology",
    roles: [
      { id: "grad-swe-2", label: "Graduate Software Engineer", patterns: ["graduate software", "software graduate"] },
      { id: "grad-tech-analyst", label: "Graduate Technology Analyst", patterns: ["graduate technology analyst", "technology analyst"] },
      { id: "grad-it", label: "Graduate IT", patterns: ["graduate it", "it graduate", "information technology graduate", "graduate it analyst"] },
      { id: "tech-grad", label: "Technology Graduate", patterns: ["technology graduate", "graduate technology", "technology and ai", "technology programme", "tech graduate", "global technology"] },
      { id: "digital-grad", label: "Digital Graduate", patterns: ["digital graduate", "graduate digital"] },
      { id: "eng-grad", label: "Engineering Graduate (only when clearly software/tech)", patterns: ["engineering graduate", "graduate engineer"], needsTechContext: true },
    ],
  },
];

export const EMPLOYMENT_OPTIONS: { id: EmploymentType; label: string }[] = [
  { id: "FULL_TIME", label: "Full-time" },
  { id: "GRADUATE", label: "Graduate" },
  { id: "PART_TIME", label: "Part-time" },
  { id: "INTERNSHIP", label: "Internship" },
  { id: "PLACEMENT", label: "Placement" },
  { id: "CONTRACT", label: "Contract" },
  { id: "APPRENTICESHIP", label: "Apprenticeship" },
];

export const WORK_MODE_OPTIONS: { id: WorkMode; label: string }[] = [
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybrid" },
  { id: "onsite", label: "On-site" },
];

export const DEFAULT_EXCLUDED = [
  "Stock Taker",
  "Warehouse Operative",
  "Warehouse Worker",
  "Warehouse",
  "Retail Assistant",
  "Retail Team Member",
  "Sales Assistant",
  "Sales Associate",
  "Cashier",
  "Cleaner",
  "Kitchen Assistant",
  "Kitchen Porter",
  "Waiter",
  "Waitress",
  "Delivery Driver",
  "Van Driver",
  "Care Assistant",
  "Security Guard",
  "Bar Staff",
  "Bartender",
  "Hospitality Assistant",
  "Customer Service Assistant",
  "Crew Member",
  "Team Member",
  "Front of House",
  "Barista",
];

export interface JobPreferences {
  version: 1;
  preferredCompanies: string[];
  onlyPreferredCompanies: boolean;
  /** Selected role ids per category id. A category missing here means all its roles are selected. */
  roles: Record<string, string[]>;
  customRoleKeywords: string[];
  excludedKeywords: string[];
  employment: EmploymentType[];
  locationFilter: boolean;
  preferredLocations: string[];
  workModes: WorkMode[];
}

export const defaultJobPreferences = (): JobPreferences => ({
  version: 1,
  preferredCompanies: [],
  onlyPreferredCompanies: false,
  roles: Object.fromEntries(ROLE_CATEGORIES.map((c) => [c.id, c.roles.map((r) => r.id)])),
  customRoleKeywords: [],
  excludedKeywords: [...DEFAULT_EXCLUDED],
  employment: ["FULL_TIME", "GRADUATE"],
  locationFilter: false,
  preferredLocations: [],
  workModes: ["remote", "hybrid", "onsite"],
});

const strList = (v: unknown): string[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean))] : null;

/** Fill in anything missing from saved preferences without dropping what the user chose. */
export function normalizeJobPreferences(saved: unknown, legacySkip?: unknown): JobPreferences {
  const d = defaultJobPreferences();
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<JobPreferences>;
  const roles: Record<string, string[]> = { ...d.roles };
  if (s.roles && typeof s.roles === "object") {
    for (const c of ROLE_CATEGORIES) {
      const v = strList((s.roles as Record<string, unknown>)[c.id]);
      if (v) roles[c.id] = v.filter((id) => c.roles.some((r) => r.id === id));
    }
  }
  const validEmployment = new Set(EMPLOYMENT_OPTIONS.map((e) => e.id));
  const validModes = new Set(WORK_MODE_OPTIONS.map((m) => m.id));
  let excluded = strList(s.excludedKeywords) ?? d.excludedKeywords;
  // Older versions kept a plain "skip emails that mention" list: carry it over.
  const legacy = strList(legacySkip);
  if (legacy && !s.excludedKeywords) {
    const have = new Set(excluded.map((x) => x.toLowerCase()));
    excluded = [...excluded, ...legacy.filter((x) => !have.has(x.toLowerCase()))];
  }
  return {
    version: 1,
    preferredCompanies: strList(s.preferredCompanies) ?? d.preferredCompanies,
    onlyPreferredCompanies: typeof s.onlyPreferredCompanies === "boolean" ? s.onlyPreferredCompanies : d.onlyPreferredCompanies,
    roles,
    customRoleKeywords: strList(s.customRoleKeywords) ?? d.customRoleKeywords,
    excludedKeywords: excluded,
    employment: (strList(s.employment)?.filter((e) => validEmployment.has(e as EmploymentType)) as EmploymentType[] | undefined) ?? d.employment,
    locationFilter: typeof s.locationFilter === "boolean" ? s.locationFilter : d.locationFilter,
    preferredLocations: strList(s.preferredLocations) ?? d.preferredLocations,
    workModes: (strList(s.workModes)?.filter((m) => validModes.has(m as WorkMode)) as WorkMode[] | undefined) ?? d.workModes,
  };
}
