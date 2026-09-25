import type { ScanSummary } from "../types";

export type ScanState =
  | { phase: "idle" }
  | { phase: "scanning"; message: string }
  | { phase: "done"; summary: ScanSummary; cached?: boolean }
  | { phase: "error"; message: string; rateLimited?: boolean };

const ago = (ms: number) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s} second${s === 1 ? "" : "s"} ago` : `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? "" : "s"} ago`;
};

export function ScanStatus({ state, onClose, onChangePrefs, onForceScan }: {
  state: ScanState;
  onClose: () => void;
  onChangePrefs: () => void;
  onForceScan: () => void;
}) {
  if (state.phase === "idle") return null;

  if (state.phase === "scanning") {
    return (
      <section className="scan-status busy" aria-live="polite" aria-busy="true">
        <div className="row">
          <span className="icon-badge"><span className="spinner" aria-hidden="true" /></span>
          <div>
            <h2>Scanning Gmail…</h2>
            <p>{state.message}</p>
          </div>
        </div>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className={`scan-status ${state.rateLimited ? "warn" : "err"}`} role="alert">
        <div className="row">
          <span className="icon-badge" aria-hidden="true">!</span>
          <div>
            <h2>{state.rateLimited ? "Gmail asked us to slow down" : "Scan didn't finish"}</h2>
            <p>{state.message}</p>
          </div>
          <button type="button" className="icon close" aria-label="Dismiss message" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
      </section>
    );
  }

  const { summary, cached } = state;
  const n = summary.relevant.length;
  return (
    <section className={`scan-status ${n ? "ok" : "warn"}`} aria-live="polite">
      <div className="row">
        <span className="icon-badge" aria-hidden="true">{n ? "✓" : "–"}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>{n ? `Found ${n} relevant application${n === 1 ? "" : "s"}` : "No relevant applications found based on your current Job Preferences."}</h2>
          {cached && <p>You scanned {ago(summary.at)}, so these are the last results. Nothing was downloaded again.</p>}
          {!n && !cached && <p>Checked {summary.checked} new email{summary.checked === 1 ? "" : "s"}.</p>}
        </div>
        <button type="button" className="icon close" aria-label="Dismiss message" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
      {n > 0 && (
        <ul>
          {summary.relevant.slice(0, 8).map((r, i) => (
            <li key={i}>
              {r.title ? `${r.title} — ` : ""}
              {r.company}
            </li>
          ))}
          {n > 8 && <li>and {n - 8} more</li>}
        </ul>
      )}
      <div className="foot">
        {summary.skippedByPrefs > 0 && (
          <span>
            {summary.skippedByPrefs} job{summary.skippedByPrefs === 1 ? "" : "s"} skipped by your Job Preferences.
          </span>
        )}
        <button type="button" className="linkbtn" onClick={onChangePrefs}>Change preferences</button>
        {cached && <button type="button" className="linkbtn" onClick={onForceScan}>Scan again now</button>}
      </div>
    </section>
  );
}
