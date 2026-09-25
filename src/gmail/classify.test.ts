import { describe, expect, it } from "vitest";
import { classify, findDeadline, normCompany } from "./classify";
import type { EmailInput } from "../types";

const mail = (from: string, subject: string, snippet: string, body?: string): EmailInput => ({
  threadId: "t1",
  from,
  subject,
  snippet,
  body,
  date: "2026-09-21",
});

describe("classify: outcomes", () => {
  it("reads an application confirmation", () => {
    const c = classify(mail("Northwind Careers <careers@northwind.com>", "Thank you for applying to Northwind", "Thank you for your application for the Graduate Software Engineer position. We'll be in touch."));
    expect(c.relevant).toBe(true);
    expect(c.status).toBe("applied");
    expect(c.company).toBe("Northwind");
    expect(c.role).toBe("Graduate Software Engineer");
    expect(c.confidence).toBe("sure");
  });

  it("reads a rejection", () => {
    const c = classify(mail("no-reply@hire.lever.co", "Your application to Lumen Health", "Hi Sam, thank you for applying. Unfortunately we have decided to move forward with other candidates."));
    expect(c.status).toBe("rejected");
    expect(c.company).toBe("Lumen Health");
  });

  it("treats 'position has been filled' as a rejection", () => {
    const c = classify(mail("harbour@myworkday.com", "Update on your application", "The Software Engineer position has recently been filled."));
    expect(c.status).toBe("rejected");
  });

  it("reads an online assessment invite with a day-count deadline", () => {
    const c = classify(mail("Cobalt Energy <recruitment@cobalt-energy.co.uk>", "Invitation to complete Online Assessment", "We're pleased to invite you to complete an online assessment. You have 7 days to complete it."));
    expect(c.status).toBe("oa_todo");
    expect(c.nextStep).toBe("Complete online assessment");
    expect(c.dueOn).toBe("2026-09-28");
  });

  it("reads a completed assessment", () => {
    const c = classify(mail("Brightline <gart@brightline.com>", "Online Assessment Complete", "Thank you for completing the online assessments for the Technology Graduate Scheme."));
    expect(c.status).toBe("oa_done");
    expect(c.oaDone).toBe(true);
  });

  it("reads an interview invite", () => {
    const c = classify(mail("Apex Games Talent <talent@apexgames.io>", "Next steps", "We'd like to invite you to a first-round interview for the Junior Backend Engineer role."));
    expect(c.status).toBe("interview");
  });

  it("maps a video interview request to 'OA to do'", () => {
    const c = classify(mail("no-reply@harri.com", "Your Video Interview", "We're delighted to invite you to the next stage of our recruitment process, which is a video interview."));
    expect(c.status).toBe("oa_todo");
    expect(c.nextStep).toBe("Complete video interview");
  });

  it("reads an offer", () => {
    const c = classify(mail("Lumen Health <people@lumenhealth.com>", "Your offer", "We are delighted to offer you the position of Junior Full Stack Developer."));
    expect(c.status).toBe("offer");
  });
});

describe("classify: things to skip", () => {
  it("skips job alerts", () => {
    const c = classify(mail("jobalerts-noreply@linkedin.com", "10 new jobs for you", "Top jobs matching your profile"));
    expect(c.relevant).toBe(false);
  });

  it("skips user keywords", () => {
    const c = classify(mail("no-reply@harri.com", "Thanks for your Part Time Team Member application", "Thanks for applying for the Part Time Team Member role."), ["part time"]);
    expect(c.relevant).toBe(false);
    expect(c.skipReason).toContain("part time");
  });

  it("asks for the full body when the subject is vague", () => {
    const c = classify(mail("careers@acme.com", "Update on your application", "Dear Sam, thank you for your interest in Acme."));
    expect(c.needsBody).toBe(true);
  });

  it("uses the body once provided", () => {
    const c = classify(mail("careers@acme.com", "Update on your application", "Dear Sam, thank you for your interest in Acme.", "After careful review we regret to inform you that we will not be progressing your application."));
    expect(c.needsBody).toBe(false);
    expect(c.status).toBe("rejected");
  });
});

describe("classify: company from platform senders", () => {
  it("uses the Workday tenant name and marks it unsure-safe", () => {
    const c = classify(mail("northwind@myworkday.com", "Thank you - we've received your job application", "Thank you for your interest."));
    expect(c.company.toLowerCase()).toBe("northwind");
  });

  it("marks confidence unsure when no company can be found", () => {
    const c = classify(mail("no-reply@hire.lever.co", "Thanks for applying!", "We received your application."));
    expect(c.confidence).toBe("unsure");
  });
});

describe("classify: tricky cases", () => {
  it("treats 'you haven't yet completed' as a reminder, not a completion", () => {
    const c = classify(mail("careers@jobalerts-uk.northwind.com", "Reminder - Northwind Job Application: Invitation to complete Online Assessment", "We've noticed that you haven't yet completed your assessment. You only have seven days to complete it."));
    expect(c.relevant).toBe(true);
    expect(c.status).toBe("oa_todo");
    expect(c.company.toLowerCase()).toBe("northwind");
  });

  it("doesn't mistake the start of a job title for the company", () => {
    const c = classify(mail("jobs-noreply@linkedin.com", "Your application to Junior Full Stack Engineers at Owen Brothers", "Your application to Junior Full Stack Engineers", "Your application was sent to Owen Brothers"));
    expect(c.company).toBe("Owen Brothers");
  });

  it("stops the company name at a full stop", () => {
    const c = classify(mail("team@hi.wellfound.com", "An update from Planar", "Thank you for your application to the Associate Software Engineer position at Planar. Unfortunately, they've chosen not to move forward."));
    expect(c.company).toBe("Planar");
    expect(c.status).toBe("rejected");
  });

  it("cross-checks the company against the sender's domain", () => {
    const c = classify(mail("careers@recruitment.harbourbank.com", "Thank you for applying to Campus - Software Engineer 2027", "Thank you for exploring career opportunities with Harbour Bank! Your application has been received."));
    expect(c.company).toBe("Harbour Bank");
  });
});

describe("helpers", () => {
  it("finds 'by 30 September' deadlines", () => {
    expect(findDeadline("Please complete it by 30 September.", "2026-09-21")).toBe("2026-09-30");
  });
  it("rolls a past month into next year", () => {
    expect(findDeadline("Deadline: 5 January", "2026-12-20")).toBe("2027-01-05");
  });
  it("normalises company names for matching", () => {
    expect(normCompany("Bain & Company")).toBe(normCompany("bain and company"));
    expect(normCompany("Acme Ltd")).toBe(normCompany("ACME"));
  });
});
