import type { Settings } from "./types";
import { normalizeJobPreferences } from "./jobs/preferences";

/** Same key as v1.0 so existing settings (including the client ID) carry over. */
const KEY = "jat-settings-v1";

export const MAX_EMAILS_OPTIONS = [25, 50, 100];
export const DEFAULT_MAX_EMAILS = 50;

export const ENV_CLIENT_ID = (import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";

/**
 * Load settings, migrating older shapes without losing anything:
 * v1.0 stored { clientId, skipKeywords, firstScanDays }. Its skip list is merged
 * into the new excluded job types; everything else is kept as is.
 */
export function loadSettings(): Settings {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    /* storage blocked or corrupt: use defaults */
  }
  const maxEmails = Number(saved.maxEmails);
  return {
    clientId: (typeof saved.clientId === "string" && saved.clientId) || ENV_CLIENT_ID,
    firstScanDays: Number(saved.firstScanDays) || 30,
    maxEmails: MAX_EMAILS_OPTIONS.includes(maxEmails) ? maxEmails : DEFAULT_MAX_EMAILS,
    jobPrefs: normalizeJobPreferences(saved.jobPrefs, saved.skipKeywords),
  };
}

/** Write settings, keeping any keys this version doesn't know about. */
export function saveSettings(s: Settings): void {
  try {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      /* ignore */
    }
    const { skipKeywords: _legacy, ...rest } = existing;
    localStorage.setItem(KEY, JSON.stringify({ ...rest, ...s }));
  } catch {
    /* ignore: settings just won't persist */
  }
}

/** Google OAuth web client IDs look like 1234567890-abc123.apps.googleusercontent.com */
export const CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
