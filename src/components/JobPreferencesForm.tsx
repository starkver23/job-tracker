import { useEffect, useRef } from "react";
import { ChipInput } from "./ChipInput";
import { DEFAULT_EXCLUDED, EMPLOYMENT_OPTIONS, ROLE_CATEGORIES, WORK_MODE_OPTIONS, type EmploymentType, type JobPreferences, type WorkMode } from "../jobs/preferences";

function CategoryBox({ cat, selected, onChange }: {
  cat: (typeof ROLE_CATEGORIES)[number];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const all = cat.roles.map((r) => r.id);
  const ref = useRef<HTMLInputElement>(null);
  const count = selected.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < all.length;
  }, [count, all.length]);
  return (
    <fieldset className="cat">
      <legend>
        <label className="check" style={{ fontWeight: 600 }}>
          <input ref={ref} type="checkbox" checked={count === all.length} onChange={(e) => onChange(e.target.checked ? all : [])} />
          {cat.label}
          <span className="mono" style={{ fontSize: 12 }}>
            {count}/{all.length}
          </span>
        </label>
      </legend>
      <div className="roles">
        {cat.roles.map((r) => (
          <label className="check" key={r.id}>
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              onChange={(e) => onChange(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))}
            />
            {r.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function JobPreferencesForm({ prefs, onChange }: { prefs: JobPreferences; onChange: (p: JobPreferences) => void }) {
  const set = <K extends keyof JobPreferences>(k: K, v: JobPreferences[K]) => onChange({ ...prefs, [k]: v });
  const toggle = <T extends string>(list: T[], v: T, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

  return (
    <div className="prefs-grid">
      <p className="span2" style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
        Gmail scans only suggest jobs that match these preferences. It's deliberately cautious: it would rather miss a borderline
        email than fill your tracker with irrelevant roles. You still approve every suggestion.
      </p>

      <section className="pref-card span2" aria-labelledby="pref-roles">
        <h3 id="pref-roles">Roles</h3>
        <span className="hint">Tick whole categories or individual roles. A job must match at least one to be suggested.</span>
        <div className="roles-grid">
          {ROLE_CATEGORIES.map((c) => (
            <CategoryBox key={c.id} cat={c} selected={prefs.roles[c.id] ?? []} onChange={(ids) => set("roles", { ...prefs.roles, [c.id]: ids })} />
          ))}
        </div>
        <ChipInput
          id="pref-custom"
          label="Custom role keywords"
          values={prefs.customRoleKeywords}
          onChange={(v) => set("customRoleKeywords", v)}
          placeholder="e.g. Java Developer"
          addLabel="Add keyword"
        />
      </section>

      <section className="pref-card" aria-labelledby="pref-excluded">
        <h3 id="pref-excluded">Excluded job types</h3>
        <span className="hint">Jobs whose title or subject contains any of these are never suggested.</span>
        <ChipInput
          id="pref-excl"
          label="Excluded keywords"
          values={prefs.excludedKeywords}
          onChange={(v) => set("excludedKeywords", v)}
          placeholder="e.g. Stock Taker"
          addLabel="Add excluded keyword"
        />
        <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => set("excludedKeywords", [...new Set([...prefs.excludedKeywords, ...DEFAULT_EXCLUDED])])}>
          Restore default exclusions
        </button>
      </section>

      <section className="pref-card" aria-labelledby="pref-employment">
        <h3 id="pref-employment">Employment type</h3>
        <span className="hint">Only filters jobs where the email states a type. Jobs that don't say are still considered.</span>
        <div className="checks">
          {EMPLOYMENT_OPTIONS.map((o) => (
            <label className="check" key={o.id}>
              <input
                type="checkbox"
                checked={prefs.employment.includes(o.id)}
                onChange={(e) => set("employment", toggle<EmploymentType>(prefs.employment, o.id, e.target.checked))}
              />
              {o.label}
            </label>
          ))}
        </div>
      </section>

      <section className="pref-card" aria-labelledby="pref-companies">
        <h3 id="pref-companies">Companies</h3>
        <ChipInput
          id="pref-co"
          label="Preferred companies"
          values={prefs.preferredCompanies}
          onChange={(v) => set("preferredCompanies", v)}
          placeholder="e.g. Microsoft"
          addLabel="Add company"
        />
        <label className="switch">
          <input
            type="checkbox"
            checked={prefs.onlyPreferredCompanies}
            disabled={!prefs.preferredCompanies.length}
            onChange={(e) => set("onlyPreferredCompanies", e.target.checked)}
          />
          Only show jobs from preferred companies
        </label>
        <span className="hint">
          {prefs.onlyPreferredCompanies && prefs.preferredCompanies.length
            ? "Only these companies will be suggested."
            : "All companies are considered. Preferred ones get a small boost, and appear even when the role is unclear."}
        </span>
      </section>

      <section className="pref-card" aria-labelledby="pref-locations">
        <h3 id="pref-locations">Locations</h3>
        <label className="switch">
          <input type="checkbox" checked={prefs.locationFilter} onChange={(e) => set("locationFilter", e.target.checked)} />
          Filter by location
        </label>
        <fieldset disabled={!prefs.locationFilter} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10, opacity: prefs.locationFilter ? 1 : 0.6 }}>
          <ChipInput
            id="pref-loc"
            label="Preferred locations"
            values={prefs.preferredLocations}
            onChange={(v) => set("preferredLocations", v)}
            placeholder="e.g. Birmingham"
            addLabel="Add location"
          />
          <div className="checks" role="group" aria-label="Work arrangement">
            {WORK_MODE_OPTIONS.map((o) => (
              <label className="check" key={o.id}>
                <input
                  type="checkbox"
                  checked={prefs.workModes.includes(o.id)}
                  onChange={(e) => set("workModes", toggle<WorkMode>(prefs.workModes, o.id, e.target.checked))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <span className="hint">Jobs that don't mention a location are still considered.</span>
      </section>
    </div>
  );
}
