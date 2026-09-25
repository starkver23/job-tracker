import type { Settings } from "./types";

const KEY = "jat-settings-v1";

export const DEFAULT_SKIP = [
  "part time",
  "part-time",
  "crew member",
  "team member",
  "bar staff",
  "warehouse",
  "front of house",
  "sales associate",
];

export const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";

export function loadSettings(): Settings {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    /* storage blocked or corrupt: use defaults */
  }
  return {
    clientId: saved.clientId || ENV_CLIENT_ID,
    skipKeywords: Array.isArray(saved.skipKeywords) ? saved.skipKeywords : DEFAULT_SKIP,
    firstScanDays: Number(saved.firstScanDays) || 30,
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore: settings just won't persist */
  }
}

/** Google OAuth web client IDs look like 1234567890-abc123.apps.googleusercontent.com */
export const CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
