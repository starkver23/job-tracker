export type Stage = "applied" | "oa_todo" | "oa_done" | "interview" | "offer" | "rejected";

export interface Application {
  id: string;
  company: string;
  role: string;
  status: Stage;
  oaDone: boolean;
  appliedOn: string; // YYYY-MM-DD or ""
  nextStep: string;
  dueOn: string; // YYYY-MM-DD or ""
  link: string;
  notes: string;
  example?: boolean;
  updatedAt: number;
}

/** Fields a suggestion may set on an application. */
export type AppChanges = Partial<Omit<Application, "id" | "example" | "updatedAt">>;

export type SuggestionState = "pending" | "accepted" | "dismissed";

export interface Suggestion {
  id: string;
  kind: "new" | "update";
  appId?: string;
  company: string;
  summary: string;
  changes: AppChanges;
  emailDate: string;
  emailSubject: string;
  emailFrom: string;
  emailUrl: string;
  threadIds: string[];
  confidence: "sure" | "unsure";
  state: SuggestionState;
  createdAt: number;
  decidedAt?: number;
}

/** One email as the classifier sees it. */
export interface EmailInput {
  threadId: string;
  from: string; // raw From header, e.g. "Acme Careers <jobs@acme.com>"
  subject: string;
  snippet: string;
  body?: string; // plain text, only fetched when the snippet is not enough
  date: string; // YYYY-MM-DD
}

export interface Settings {
  clientId: string;
  skipKeywords: string[];
  firstScanDays: number;
}
