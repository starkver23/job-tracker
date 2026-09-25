/**
 * Safe development logging for the Gmail scanner.
 * Only counts and progress are logged: never email content, addresses or tokens.
 * On in dev builds, or in production when localStorage "job-tracker-debug" is "1".
 */
function enabled(): boolean {
  if (import.meta.env?.DEV && import.meta.env?.MODE !== "test") return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("job-tracker-debug") === "1";
  } catch {
    return false;
  }
}

export function scanLog(message: string): void {
  if (enabled()) console.info(`[gmail-scan] ${message}`);
}
