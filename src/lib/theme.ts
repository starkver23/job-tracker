/**
 * Theme: "light", "dark" or "system". Stored under its own localStorage key
 * and applied as data-theme on <html>. index.html applies it before first paint.
 */
export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "job-tracker-theme";

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  const dark = choice === "dark" || (choice === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#092328" : "#F3E3D0");
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* not persisted, still applied */
  }
  applyTheme(choice);
}
