import { describe, expect, it, vi } from "vitest";

// buildSuggestions is pure, but scan.ts imports the IndexedDB layer; stub it.
vi.mock("../db", () => ({ db: {}, getKV: vi.fn(), setKV: vi.fn() }));

import { buildSuggestions, type ClassifiedEmail } from "./scan";
import { classify } from "./classify";
import type { Application, EmailInput } from "../types";

const item = (threadId: string, date: string, from: string, subject: string, snippet: string): ClassifiedEmail => {
  const email: EmailInput = { threadId, from, subject, snippet, date };
  return { email, c: classify(email), url: `https://mail.google.com/#all/${threadId}` };
};

const app = (over: Partial<Application>): Application => ({
  id: "a1",
  company: "Northwind",
  role: "",
  status: "applied",
  oaDone: false,
  appliedOn: "",
  nextStep: "",
  dueOn: "",
  link: "",
  notes: "",
  updatedAt: 0,
  ...over,
});

describe("buildSuggestions", () => {
  it("creates a 'new' suggestion for an unknown company", () => {
    const s = buildSuggestions([item("t1", "2026-09-10", "Lumen Health <jobs@lumenhealth.com>", "Thank you for applying", "Thank you for your application for the Junior Full Stack Developer role.")], []);
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe("new");
    expect(s[0].changes).toMatchObject({ company: "Lumen Health", status: "applied", appliedOn: "2026-09-10" });
  });

  it("folds several emails about one job into a single suggestion with the latest stage", () => {
    const s = buildSuggestions(
      [
        item("t1", "2026-09-05", "Cobalt Energy <hr@cobalt-energy.com>", "Thank you for applying", "We have received your application."),
        item("t2", "2026-09-08", "Cobalt Energy <hr@cobalt-energy.com>", "Invitation to complete online assessment", "Please complete the online assessment within 5 days."),
        item("t3", "2026-09-15", "Cobalt Energy <hr@cobalt-energy.com>", "Update", "Unfortunately you have not been successful at the assessment stage."),
      ],
      [],
    );
    expect(s).toHaveLength(1);
    expect(s[0].changes.status).toBe("rejected");
    expect(s[0].changes.appliedOn).toBe("2026-09-05");
    expect(s[0].threadIds).toEqual(["t1", "t2", "t3"]);
  });

  it("suggests only the fields that change for a tracked company", () => {
    const s = buildSuggestions(
      [item("t1", "2026-09-21", "Northwind Careers <careers@northwind.com>", "Invitation to complete Online Assessment", "You have 7 days to complete the online assessment.")],
      [app({ appliedOn: "2026-09-18" })],
    );
    expect(s[0].kind).toBe("update");
    expect(s[0].appId).toBe("a1");
    expect(s[0].changes).toEqual({ status: "oa_todo", nextStep: "Complete online assessment", dueOn: "2026-09-28" });
  });

  it("never moves a rejected row backwards and skips no-op updates", () => {
    const s = buildSuggestions(
      [item("t1", "2026-09-21", "Northwind Careers <careers@northwind.com>", "Thank you for applying", "We have received your application.")],
      [app({ status: "rejected", appliedOn: "2026-09-01" })],
    );
    expect(s).toHaveLength(0);
  });
});
