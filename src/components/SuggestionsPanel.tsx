import { useState } from "react";
import { describeChanges } from "../gmail/scan";
import { fmtDate } from "../lib/format";
import type { Application, Suggestion } from "../types";
import { normCompany } from "../gmail/classify";

export function SuggestionsPanel({ items, apps, scanMessage, lastScanAt, onAccept, onDismiss, onAcceptConfident, onDismissAll }: {
  items: Suggestion[];
  apps: Application[];
  scanMessage: string;
  lastScanAt: number;
  onAccept: (s: Suggestion) => Promise<void>;
  onDismiss: (s: Suggestion) => Promise<void>;
  onAcceptConfident: () => Promise<void>;
  onDismissAll: () => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length && !scanMessage) return null;

  const sorted = [...items].sort(
    (a, b) => (a.kind === "update" ? 0 : 1) - (b.kind === "update" ? 0 : 1) || b.emailDate.localeCompare(a.emailDate),
  );
  const shown = showAll ? sorted : sorted.slice(0, 6);
  const last = lastScanAt ? new Date(lastScanAt) : null;
  const isUpdate = (s: Suggestion) => s.kind === "update" || apps.some((a) => normCompany(a.company) === normCompany(s.company) && !a.example);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="inbox" aria-labelledby="inboxTitle">
      <div className="inbox-head">
        <div>
          <h2 id="inboxTitle">
            From your Gmail <span className="count">{items.length}</span>
          </h2>
          <p>
            {items.length ? "Nothing changes until you accept it." : "All caught up."}
            {last && ` Last checked ${last.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${last.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`}
          </p>
        </div>
        {items.length > 0 && (
          <div className="inbox-actions">
            <button className="btn sm" type="button" disabled={!!busy} onClick={() => run("all", onDismissAll)}>Dismiss all</button>
            <button className="btn sm primary" type="button" disabled={!!busy} onClick={() => run("all", onAcceptConfident)}>Accept all strong matches</button>
          </div>
        )}
      </div>
      {scanMessage && <div className="scanmsg" role="status">{scanMessage}</div>}
      {shown.map((s) => {
        const change = describeChanges(s);
        const role = s.changes.role;
        return (
          <div className="sugg" key={s.id}>
            <span className={`kind ${isUpdate(s) ? "update" : "new"}`}>{isUpdate(s) ? "Update" : "New"}</span>
            <div className="what">
              <div>
                <b>{s.company}</b>
                {(role || s.jobTitle) && <span className="role"> · {role || s.jobTitle}</span>}
                {change && <span className="mono"> {change}</span>}
              </div>
              <div className="sum">{s.summary}</div>
              <div className="meta">
                <span>{fmtDate(s.emailDate)}</span>
                <span title={s.emailFrom}>{s.emailSubject.length > 70 ? s.emailSubject.slice(0, 70) + "…" : s.emailSubject}</span>
                <a href={s.emailUrl} target="_blank" rel="noopener noreferrer">Open email ↗</a>
                {s.match && <span className={`match ${s.match}`} title={s.matchReason}>{s.match === "strong" ? "Strong match" : s.match === "possible" ? "Possible match" : "Tracked application"}</span>}
                {s.confidence === "unsure" && <span className="unsure">check this one</span>}
              </div>
            </div>
            <div className="acts">
              <button className="btn sm" type="button" disabled={busy === s.id} onClick={() => run(s.id, () => onDismiss(s))}>Dismiss</button>
              <button className="btn sm primary" type="button" disabled={busy === s.id} onClick={() => run(s.id, () => onAccept(s))}>Accept</button>
            </div>
          </div>
        );
      })}
      {sorted.length > 6 && (
        <button className="more" type="button" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show ${sorted.length - 6} more`}
        </button>
      )}
    </section>
  );
}
