import { useCallback, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getKV, newId, setKV } from "./db";
import { STAGES, STAGE_LABEL } from "./stages";
import { fmtDate, stageStyle } from "./lib/format";
import { useToast } from "./lib/toast";
import { loadSettings, saveSettings } from "./settings";
import { AuthError, connect, disconnect, forgetToken, getToken } from "./gmail/auth";
import { GmailError, getProfile } from "./gmail/api";
import { gmailErrorMessage } from "./gmail/errors";
import { CACHE_WINDOW_MS, ScanBusyError, acceptSuggestion, dismissSuggestion, resetScanHistory, runScan } from "./gmail/scan";
import { AppForm } from "./components/AppForm";
import { SuggestionsPanel } from "./components/SuggestionsPanel";
import { SettingsDialog, type SettingsTab } from "./components/SettingsDialog";
import { ScanStatus, type ScanState } from "./components/ScanStatus";
import { ThemeToggle } from "./components/ThemeToggle";
import { BackupDialog } from "./components/BackupDialog";
import { EXAMPLES } from "./examples";
import type { Application, ScanSummary, Settings, Stage, Suggestion } from "./types";

type Filter = "all" | Stage;
type SortKey = "stage" | "company" | "applied" | "updated";

export default function App() {
  const apps = useLiveQuery(() => db.applications.toArray(), [], undefined);
  const pending = useLiveQuery(() => db.suggestions.where("state").equals("pending").toArray(), [], []);
  const account = useLiveQuery(() => getKV<string>("account", ""), [], "");
  const lastScanAt = useLiveQuery(() => getKV<number>("lastScanAt", 0), [], 0);

  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("stage");
  const [editing, setEditing] = useState<{ app: Application | null; askDelete?: boolean } | null>(null);
  const [dialog, setDialog] = useState<"settings" | "backup" | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("prefs");
  const [scanning, setScanning] = useState(false);
  const [scanState, setScanState] = useState<ScanState>({ phase: "idle" });
  // A ref, not state: it flips synchronously, so a double click can't start two scans.
  const scanningRef = useRef(false);
  const { toast, toastNode } = useToast();

  const list = apps ?? [];
  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<Stage, number>;
    list.forEach((a) => c[a.status]++);
    return c;
  }, [list]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
    return list
      .filter((a) => filter === "all" || a.status === filter)
      .filter((a) => !q || [a.company, a.role, a.notes, a.nextStep].some((v) => v.toLowerCase().includes(q)))
      .sort((x, y) => {
        const byName = x.company.localeCompare(y.company);
        if (sort === "company") return byName;
        if (sort === "applied") return (y.appliedOn || "").localeCompare(x.appliedOn || "") || byName;
        if (sort === "updated") return y.updatedAt - x.updatedAt;
        return order[x.status] - order[y.status] || byName;
      });
  }, [list, filter, query, sort]);

  // ---------- CRUD ----------
  const saveApp = async (draft: Omit<Application, "id" | "updatedAt" | "example">) => {
    const current = editing?.app;
    await db.applications.put({ ...draft, id: current?.id ?? newId(draft.company), updatedAt: Date.now() });
    toast(current ? "Saved" : `Added ${draft.company}`);
    setEditing(null);
  };
  const deleteApp = async () => {
    const a = editing?.app;
    if (!a) return;
    await db.applications.delete(a.id);
    toast(`Deleted ${a.company}`);
    setEditing(null);
  };
  const quickStage = async (a: Application, status: Stage) => {
    await db.applications.update(a.id, { status, oaDone: a.oaDone || status === "oa_done", updatedAt: Date.now(), example: a.example });
    toast(`${a.company} → ${STAGE_LABEL[status]}`);
  };

  // ---------- Gmail ----------
  const ensureToken = useCallback(async (): Promise<string | null> => {
    const existing = getToken();
    if (existing) return existing;
    if (!settings.clientId) {
      setDialog("settings");
      return null;
    }
    const t = await connect(settings.clientId, { hint: account || undefined });
    if (!account) {
      const p = await getProfile(t);
      await setKV("account", p.emailAddress);
    }
    return t;
  }, [settings.clientId, account]);

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setDialog("settings");
  };

  /** Runs only from a click on "Scan Gmail". Never on load, sign-in or settings changes. */
  const scan = async (force = false) => {
    if (scanningRef.current) return;
    if (!settings.clientId) {
      openSettings("gmail");
      return;
    }
    if (!force) {
      const last = await getKV<ScanSummary | null>("lastScanSummary", null);
      if (last && Date.now() - last.at < CACHE_WINDOW_MS) {
        setScanState({ phase: "done", summary: last, cached: true });
        return;
      }
    }
    scanningRef.current = true;
    setScanning(true);
    setScanState({ phase: "scanning", message: "Connecting to Gmail…" });
    const progress = (message: string) => setScanState({ phase: "scanning", message });
    try {
      let token = await ensureToken();
      if (!token) {
        setScanState({ phase: "idle" });
        return;
      }
      const acct = account || (await getKV<string>("account", ""));
      let summary: ScanSummary;
      try {
        summary = await runScan(token, settings, acct, progress);
      } catch (e) {
        // Token expired mid-session: reconnect once. Already-fetched emails are cached, so nothing is refetched.
        if (e instanceof GmailError && e.kind === "auth") {
          forgetToken();
          token = await ensureToken();
          if (!token) return;
          summary = await runScan(token, settings, acct, progress);
        } else throw e;
      }
      setScanState({ phase: "done", summary });
      if (summary.relevant.length) toast(`${summary.relevant.length} new suggestion${summary.relevant.length > 1 ? "s" : ""}`);
    } catch (e) {
      if (e instanceof ScanBusyError) return;
      if (e instanceof AuthError) setScanState({ phase: "error", message: e.message });
      else if (e instanceof GmailError) setScanState({ phase: "error", message: gmailErrorMessage(e), rateLimited: e.kind === "rate_limit" });
      else setScanState({ phase: "error", message: "Something went wrong while scanning. Check your connection and try again. Your saved applications are safe." });
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  };

  const accept = async (s: Suggestion) => {
    await acceptSuggestion(s, newId);
    toast(`Updated ${s.company}`);
  };
  const dismiss = async (s: Suggestion) => {
    await dismissSuggestion(s);
  };
  const acceptConfident = async () => {
    const targets = pending.filter((s) => s.confidence !== "unsure" && s.match !== "possible");
    for (const s of targets) await acceptSuggestion(s, newId);
    toast(`Accepted ${targets.length}`);
  };
  const dismissAll = async () => {
    await db.suggestions.bulkUpdate(pending.map((s) => ({ key: s.id, changes: { state: "dismissed" as const, decidedAt: Date.now() } })));
    toast(`Dismissed ${pending.length}`);
  };

  const onSaveSettings = (s: Settings) => {
    saveSettings(s);
    if (s.clientId !== settings.clientId) forgetToken();
    setSettings(s);
    setDialog(null);
    toast("Settings saved");
  };

  const hasExamples = list.some((a) => a.example);
  const loadExamples = () => db.applications.bulkPut(EXAMPLES());
  const clearExamples = async () => {
    await db.applications.bulkDelete(list.filter((a) => a.example).map((a) => a.id));
    toast("Examples cleared");
  };

  // ---------- render ----------
  const active = list.length - counts.rejected - counts.offer;
  const dueSoon = list.filter((a) => a.status === "oa_todo").sort((a, b) => (a.dueOn || "9").localeCompare(b.dueOn || "9"));
  const oaTag = (a: Application) => (a.oaDone && a.status === "rejected" ? <span className="tag">after OA</span> : null);
  const exTag = (a: Application) => (a.example ? <span className="exrow">Example</span> : null);
  const pick = (a: Application) => (
    <select
      className="stagepick"
      style={stageStyle(a.status)}
      value={a.status}
      aria-label={`Stage for ${a.company}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => quickStage(a, e.target.value as Stage)}
    >
      {STAGES.map((s) => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </select>
  );
  const next = (a: Application) =>
    a.nextStep || a.dueOn ? (
      <>
        {a.nextStep}
        {a.dueOn && <span className="mono"> · {fmtDate(a.dueOn)}</span>}
      </>
    ) : (
      <span className="mono">—</span>
    );

  return (
    <div className="wrap">
      <header className="head">
        <div className="brand">
          <h1>Job Application Tracker</h1>
          <p className="sub">Every application, where it stands, and what's next. Stored only in this browser.</p>
        </div>
        <div className="head-tools">
          <ThemeToggle />
          <button className="btn" type="button" onClick={() => openSettings("prefs")} aria-label="Settings">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <span className="lbl">Settings</span>
          </button>
          <button className="btn" type="button" onClick={() => setDialog("backup")} aria-label="Backup and restore">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 11.5v2h11v-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="lbl">Backup</span>
          </button>
        </div>
        <div className="head-primary">
          <span className="account" title="Gmail account">
            <span className={`dot ${account && getToken() ? "live" : ""}`} aria-hidden="true" />
            {account ? account : settings.clientId ? "Gmail not connected" : "Gmail not set up"}
          </span>
          <div className="actions">
            <button className="btn" type="button" onClick={() => scan()} disabled={scanning} aria-busy={scanning}>
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2 4l6 5 6-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
              {scanning ? "Scanning Gmail…" : settings.clientId ? "Scan Gmail" : "Set up Gmail"}
            </button>
            <button className="btn primary" type="button" onClick={() => setEditing({ app: null })}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Add application
            </button>
          </div>
        </div>
      </header>

      <ScanStatus
        state={scanState}
        onClose={() => setScanState({ phase: "idle" })}
        onChangePrefs={() => openSettings("prefs")}
        onForceScan={() => scan(true)}
      />

      {hasExamples && (
        <div className="banner">
          <span>These are <b>example rows</b> so you can see how it works.</span>
          <button className="btn sm primary" type="button" onClick={clearExamples}>Clear examples</button>
        </div>
      )}

      <SuggestionsPanel
        items={pending}
        apps={list}
        scanMessage=""
        lastScanAt={lastScanAt}
        onAccept={accept}
        onDismiss={dismiss}
        onAcceptConfident={acceptConfident}
        onDismissAll={dismissAll}
      />

      {apps !== undefined && list.length === 0 ? (
        <div className="empty">
          <h2>Start tracking your applications</h2>
          <p>
            Add applications yourself, or connect your Gmail and the app will suggest them from your confirmation,
            assessment and rejection emails. You approve every change.
          </p>
          <div className="row">
            <button className="btn primary" type="button" onClick={() => setEditing({ app: null })}>Add application</button>
            <button className="btn" type="button" onClick={() => scan()} disabled={scanning}>{settings.clientId ? "Scan Gmail" : "Set up Gmail"}</button>
            <button className="btn" type="button" onClick={loadExamples}>Try with example rows</button>
          </div>
        </div>
      ) : (
        <>
          <nav className="pipeline" aria-label="Filter by stage">
            {[{ key: "all" as Filter, label: "All" }, ...STAGES].map((s) => (
              <button
                key={s.key}
                type="button"
                className="stage"
                aria-pressed={filter === s.key}
                style={s.key === "all" ? { ["--c" as string]: "var(--ink)" } : stageStyle(s.key as Stage)}
                onClick={() => setFilter((f) => (f === s.key && s.key !== "all" ? "all" : s.key))}
              >
                <span className="n">{s.key === "all" ? list.length : counts[s.key as Stage]}</span>
                <span className="l">{s.label}</span>
              </button>
            ))}
          </nav>
          {list.length > 0 && (
            <p className="insight">
              <b>{active}</b> of {list.length} still in play.
              {dueSoon.length > 0 && (
                <>
                  {" "}Assessments waiting: <b>{dueSoon.map((a) => a.company + (a.dueOn ? ` (${fmtDate(a.dueOn)})` : "")).join(", ")}</b>.
                </>
              )}
            </p>
          )}

          <div className="toolbar">
            <div className="search">
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <input id="q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, role or notes" aria-label="Search applications" />
            </div>
            <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="stage">Sort: stage</option>
              <option value="company">Sort: company A–Z</option>
              <option value="applied">Sort: newest applied</option>
              <option value="updated">Sort: recently updated</option>
            </select>
          </div>

          <div className="tablebox">
            <table>
              <thead>
                <tr><th>Company</th><th>Stage</th><th>Applied</th><th>Next step</th><th>Notes</th><th style={{ textAlign: "right" }}>Actions</th></tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={6} className="nomatch">No applications match this view.</td></tr>
                )}
                {visible.map((a) => (
                  <tr key={a.id} onClick={() => setEditing({ app: a })}>
                    <td>
                      <div className="co">{a.company}{oaTag(a)}{exTag(a)}</div>
                      {a.role && <div className="role">{a.role}</div>}
                    </td>
                    <td>{pick(a)}</td>
                    <td className="mono">{fmtDate(a.appliedOn)}</td>
                    <td>{next(a)}</td>
                    <td><div className="notes" title={a.notes}>{a.notes || <span className="mono">—</span>}</div></td>
                    <td>
                      <div className="rowact">
                        <button className="icon" type="button" aria-label={`Edit ${a.company}`} onClick={(e) => { e.stopPropagation(); setEditing({ app: a }); }}>
                          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                        </button>
                        <button className="icon" type="button" aria-label={`Delete ${a.company}`} onClick={(e) => { e.stopPropagation(); setEditing({ app: a, askDelete: true }); }}>
                          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cards">
            {visible.length === 0 && <div className="card nomatch">No applications match this view.</div>}
            {visible.map((a) => (
              <div className="card" key={a.id} onClick={() => setEditing({ app: a })}>
                <div className="top">
                  <div>
                    <div className="co">{a.company}{oaTag(a)}{exTag(a)}</div>
                    {a.role && <div className="role">{a.role}</div>}
                  </div>
                  {pick(a)}
                </div>
                {(a.nextStep || a.dueOn) && <div style={{ fontSize: 14 }}>{next(a)}</div>}
                {a.notes && <div className="notes" style={{ maxWidth: "none" }}>{a.notes}</div>}
                <div className="mono">Applied {fmtDate(a.appliedOn)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <footer>Open source · Your data never leaves this browser · Gmail access is read-only</footer>

      {editing && (
        <AppForm
          app={editing.app}
          askDelete={editing.askDelete}
          defaultStatus={filter === "all" ? "applied" : filter}
          onSave={saveApp}
          onDelete={deleteApp}
          onClose={() => setEditing(null)}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          settings={settings}
          account={account}
          initialTab={settingsTab}
          toast={toast}
          onSave={onSaveSettings}
          onClose={() => setDialog(null)}
          onDisconnect={async () => {
            await disconnect();
            await setKV("account", "");
            toast("Gmail disconnected");
            setDialog(null);
          }}
          onResetScan={async () => {
            await resetScanHistory();
            toast("Next scan will re-read your inbox");
          }}
        />
      )}
      {dialog === "backup" && (
        <BackupDialog
          apps={list}
          toast={toast}
          onClose={() => setDialog(null)}
          onRestore={async (rows) => {
            await db.applications.bulkPut(rows);
            toast(`Restored ${rows.length} application${rows.length === 1 ? "" : "s"}`);
            setDialog(null);
          }}
          onWipe={async () => {
            await Promise.all([db.applications.clear(), db.suggestions.clear(), resetScanHistory()]);
            toast("Everything deleted");
            setDialog(null);
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
