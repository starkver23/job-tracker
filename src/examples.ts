import type { Application } from "./types";

const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Invented sample rows, clearly flagged so they can be cleared in one click. */
export const EXAMPLES = (): Application[] =>
  (
    [
      ["Northwind Bank", "Graduate Software Engineer", "oa_todo", false, -4, "Complete online assessment", 3, ""],
      ["Lumen Health", "Junior Full Stack Developer", "interview", true, -15, "First-round interview", 6, "Ask about the React migration."],
      ["Brightline Consulting", "Technology Graduate Scheme", "oa_done", true, -10, "", null, ""],
      ["Harbour Logistics", "Associate Software Engineer", "applied", false, -2, "", null, ""],
      ["Apex Games", "Junior Backend Engineer", "rejected", false, -20, "", null, ""],
      ["Cobalt Energy", "IT Graduate Programme", "rejected", true, -25, "", null, "Rejected after the assessment."],
    ] as const
  ).map(([company, role, status, oaDone, applied, nextStep, due, notes], i) => ({
    id: `example-${i + 1}`,
    company,
    role,
    status,
    oaDone,
    appliedOn: daysFromToday(applied),
    nextStep,
    dueOn: due === null ? "" : daysFromToday(due),
    link: "",
    notes,
    example: true,
    updatedAt: Date.now() - i,
  }));
