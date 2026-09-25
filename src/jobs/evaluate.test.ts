import { describe, expect, it } from "vitest";
import { detectEmployment, evaluateJob, extractJobInfo, extractTitle, hasPhrase, type JobContext } from "./evaluate";
import { defaultJobPreferences, normalizeJobPreferences, type JobPreferences } from "./preferences";

/** Evaluate a job described by its title (as it would appear in a confirmation email). */
function judge(title: string, prefs: JobPreferences = defaultJobPreferences(), extra: Partial<JobContext> = {}) {
  const subject = `Thank you for applying for the ${title} position`;
  const info = extractJobInfo([subject]);
  return evaluateJob({ company: "Acme", info, subject, body: "", tracked: false, ...extra }, prefs);
}

describe("role detection: technical roles are included (1-10)", () => {
  const cases: [number, string][] = [
    [1, "Software Engineer"],
    [2, "Software Development Engineer"],
    [3, "Graduate Software Engineer"],
    [4, "Full Stack Developer"],
    [5, "AI Engineer"],
    [6, "Machine Learning Engineer"],
    [7, "Data Analyst"],
    [8, "Data Scientist"],
    [9, "Cloud Engineer"],
    [10, "Technical Consultant"],
  ];
  for (const [n, title] of cases) {
    it(`${n}. ${title} → included`, () => {
      const r = judge(title);
      expect(r.include).toBe(true);
      expect(r.label).toBe("strong");
    });
  }
});

describe("excluded job types (11-16)", () => {
  it("11. Stock Taker → excluded, even as 'Full and Part Time Stock Taker'", () => {
    const r = judge("Full and Part Time Stock Taker");
    expect(r.include).toBe(false);
    expect(r.category).toBe("NON_TECHNICAL");
    expect(r.reason).toContain("Stock Taker");
  });
  for (const [n, title] of [
    [12, "Retail Assistant"],
    [13, "Warehouse Operative"],
    [14, "Cleaner"],
    [15, "Waiter"],
  ] as const) {
    it(`${n}. ${title} → excluded`, () => expect(judge(title).include).toBe(false));
  }
  it("16. a custom excluded keyword → excluded", () => {
    const prefs = { ...defaultJobPreferences(), excludedKeywords: ["Sales"] };
    expect(judge("Graduate Sales Engineer", prefs).include).toBe(false);
  });
  it("roles outside every selected category are not suggested", () => {
    expect(judge("Marketing Coordinator").include).toBe(false);
  });
  it("'Graduate Engineer' only counts when it's clearly software/tech", () => {
    expect(judge("Graduate Engineer").include).toBe(false);
    expect(judge("Graduate Engineer - Software").include).toBe(true);
  });
});

describe("custom keywords, companies, employment, location (17-20)", () => {
  it("17. a custom role keyword → included", () => {
    const prefs = { ...defaultJobPreferences(), customRoleKeywords: ["Spring Boot"] };
    expect(judge("Spring Boot Wizard", prefs).include).toBe(true);
    expect(judge("Spring Boot Wizard").include).toBe(false);
  });

  it("18. preferred-company filter only applies when switched on", () => {
    const prefs = { ...defaultJobPreferences(), preferredCompanies: ["Microsoft", "JPMorgan"] };
    expect(judge("Software Engineer", prefs, { company: "Acme" }).include).toBe(true);
    const only = { ...prefs, onlyPreferredCompanies: true };
    expect(judge("Software Engineer", only, { company: "Acme" }).include).toBe(false);
    expect(judge("Software Engineer", only, { company: "Microsoft UK" }).include).toBe(true);
    expect(judge("Software Engineer", only, { company: "JPMorganChase" }).include).toBe(true);
  });

  it("18b. a preferred company is a possible match even when the role is unclear", () => {
    const prefs = { ...defaultJobPreferences(), preferredCompanies: ["Goldman Sachs"] };
    const info = extractJobInfo(["Thank you for applying to Goldman Sachs"]);
    const r = evaluateJob({ company: "Goldman Sachs", info, subject: "Thank you for applying to Goldman Sachs", body: "", tracked: false }, prefs);
    expect(r.include).toBe(true);
    expect(r.label).toBe("possible");
  });

  it("19. employment type filter works", () => {
    expect(judge("Part-time Software Developer").include).toBe(false); // part-time not selected by default
    const withPart = { ...defaultJobPreferences(), employment: [...defaultJobPreferences().employment, "PART_TIME" as const] };
    expect(judge("Part-time Software Developer", withPart).include).toBe(true);
    expect(judge("Software Engineer Internship").include).toBe(false);
    expect(judge("Software Engineer").include).toBe(true); // no type stated → allowed
  });

  it("20. location filter works and is optional", () => {
    const on = { ...defaultJobPreferences(), locationFilter: true, preferredLocations: ["Birmingham", "London"] };
    expect(judge("Software Engineer - Manchester", on).include).toBe(false);
    expect(judge("Software Engineer - London", on).include).toBe(true);
    expect(judge("Software Engineer", on).include).toBe(true); // unknown location is allowed
    expect(judge("Software Engineer - Manchester").include).toBe(true); // filter off
    const noRemote = { ...on, workModes: ["hybrid" as const, "onsite" as const] };
    expect(judge("Remote Software Engineer", noRemote).include).toBe(false);
  });

  it("updates for applications already in the tracker are always shown", () => {
    const info = extractJobInfo(["Update on your application"]);
    const r = evaluateJob({ company: "Acme", info, subject: "Update on your application", body: "", tracked: true }, defaultJobPreferences());
    expect(r.include).toBe(true);
    expect(r.label).toBe("tracked");
  });

  it("deselecting a whole category removes its roles", () => {
    const prefs = defaultJobPreferences();
    prefs.roles.data = [];
    expect(judge("Data Scientist", prefs).include).toBe(false);
    expect(judge("Software Engineer", prefs).include).toBe(true);
  });
});

describe("extraction helpers", () => {
  it("finds titles in common confirmation wording", () => {
    expect(extractTitle(["Thank you for applying for the Full and Part Time Stock Taker position."])).toBe("Full and Part Time Stock Taker");
    expect(extractTitle(["Your application: Associate Software Engineer - Full Stack ID 378830 at DHL Group"])).toBe("Associate Software Engineer - Full Stack");
    expect(extractTitle(["Job Title: Graduate Data Analyst"])).toBe("Graduate Data Analyst");
  });
  it("detects employment types including 'full and part time'", () => {
    expect(detectEmployment("Full and Part Time Stock Taker").sort()).toEqual(["FULL_TIME", "PART_TIME"]);
    expect(detectEmployment("Summer Internship 2027")).toContain("INTERNSHIP");
    expect(detectEmployment("Graduate Scheme")).toContain("GRADUATE");
  });
  it("matches phrases on word boundaries only", () => {
    expect(hasPhrase("Senior SDE II", "SDE")).toBe(true);
    expect(hasPhrase("Inside sales", "SDE")).toBe(false);
    expect(hasPhrase("Full-stack developer", "full stack")).toBe(true);
  });
  it("keeps old 'skip' keywords when migrating v1.0 settings", () => {
    const p = normalizeJobPreferences(undefined, ["bar staff", "night shift"]);
    expect(p.excludedKeywords).toContain("night shift");
    expect(p.employment).toEqual(["FULL_TIME", "GRADUATE"]);
  });
});
