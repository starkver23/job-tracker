import { useState } from "react";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "../lib/theme";

const OPTIONS: { id: ThemeChoice; label: string; icon: JSX.Element }[] = [
  {
    id: "light",
    label: "Light theme",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dark",
    label: "Dark theme",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 107 7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "system",
    label: "Match system theme",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.5 14h5M8 11.5V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** Three-way Light / Dark / System switch. Your explicit choice always wins over the system setting. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice);
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className="theme-opt"
          aria-pressed={choice === o.id}
          aria-label={o.label}
          title={o.label}
          onClick={() => {
            setChoice(o.id);
            setThemeChoice(o.id);
          }}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
