import Dexie, { type Table } from "dexie";
import type { Application, Suggestion } from "./types";

interface Handled {
  threadId: string;
  at: number;
}
interface Processed {
  id: string; // Gmail message id
  at: number;
  /** false while a scan that fetched it hasn't finished; such messages are reused, not refetched */
  done?: boolean;
  /** subject/sender/preview kept locally so an interrupted scan can resume without refetching */
  meta?: import("./types").EmailInput;
  url?: string;
}
interface KV {
  key: string;
  value: unknown;
}

/** Everything is stored in this browser's IndexedDB. Nothing leaves the device. */
class TrackerDB extends Dexie {
  applications!: Table<Application, string>;
  suggestions!: Table<Suggestion, string>;
  handled!: Table<Handled, string>; // v1: per-thread (kept so old data stays readable)
  processedMessages!: Table<Processed, string>; // v2: per-message dedupe
  kv!: Table<KV, string>;

  constructor() {
    super("job-application-tracker");
    this.version(1).stores({
      applications: "id, company, status, updatedAt",
      suggestions: "id, state, createdAt",
      handled: "threadId",
      kv: "key",
    });
    // v2 only adds a table. Existing tables and rows are untouched.
    this.version(2).stores({
      processedMessages: "id",
    });
  }
}

export const db = new TrackerDB();

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}
export const setKV = (key: string, value: unknown) => db.kv.put({ key, value });

export function newId(company: string): string {
  const base =
    company
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "app";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
