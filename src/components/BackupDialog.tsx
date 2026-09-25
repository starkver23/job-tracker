import { useState } from "react";
import { Modal } from "./Modal";
import { copyText, downloadFile, todayISO } from "../lib/format";
import { STAGE_LABEL, isStage } from "../stages";
import type { Application } from "../types";

export function BackupDialog({ apps, onRestore, onWipe, onClose, toast }: {
  apps: Application[];
  onRestore: (rows: Application[]) => Promise<void>;
  onWipe: () => Promise<void>;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const real = apps.filter((a) => !a.example).map(({ example: _e, ...a }) => a);
  const backup = JSON.stringify({ app: "gmail-job-tracker", version: 1, exportedAt: new Date().toISOString(), applications: real }, null, 2);
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState("");
  const [wipe, setWipe] = useState(false);

  const csv = () => {
    const cols = ["company", "role", "status", "oaDone", "appliedOn", "nextStep", "dueOn", "link", "notes"] as const;
    const q = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = real.map((a) => cols.map((c) => (c === "status" ? STAGE_LABEL[a.status] : a[c])).map(q).join(","));
    downloadFile(`job-tracker-${todayISO()}.csv`, [cols.join(","), ...rows].join("\n"), "text/csv");
  };

  const restore = async () => {
    setErr("");
    let data: unknown;
    try {
      data = JSON.parse(paste);
    } catch {
      setErr("That isn't backup data. Paste the whole backup text, or choose the saved .json file.");
      return;
    }
    const list = Array.isArray(data) ? data : (data as { applications?: unknown })?.applications;
    if (!Array.isArray(list)) {
      setErr("No applications found in that backup.");
      return;
    }
    const rows: Application[] = list
      .filter((a) => a && typeof a.company === "string" && a.company.trim())
      .map((a) => ({
        id: String(a.id || `${a.company}-${Math.random().toString(36).slice(2, 7)}`),
        company: a.company.trim(),
        role: String(a.role || ""),
        status: isStage(a.status) ? a.status : "applied",
        oaDone: !!a.oaDone,
        appliedOn: String(a.appliedOn || ""),
        nextStep: String(a.nextStep || ""),
        dueOn: String(a.dueOn || ""),
        link: String(a.link || ""),
        notes: String(a.notes || ""),
        updatedAt: Number(a.updatedAt) || Date.now(),
      }));
    await onRestore(rows);
  };

  return (
    <Modal onClose={onClose} labelledBy="btitle">
      <h2 id="btitle">Backup &amp; restore</h2>
      <p className="sub" style={{ margin: 0 }}>
        Your tracker lives only in this browser. Save a backup before clearing browser data or to move to another device.
      </p>
      <div className="field">
        <label htmlFor="b-export">Backup data</label>
        <textarea id="b-export" readOnly value={backup} style={{ fontFamily: "var(--mono)", fontSize: 12, minHeight: 110 }} />
      </div>
      <div className="codeline">
        <button className="btn" type="button" onClick={async () => toast((await copyText(backup)) ? "Backup copied" : "Select the text and copy it")}>Copy backup</button>
        <button className="btn" type="button" onClick={() => downloadFile(`job-tracker-backup-${todayISO()}.json`, backup, "application/json")}>Save as file</button>
        <button className="btn" type="button" onClick={csv}>Save as CSV</button>
      </div>
      <div className="field">
        <label htmlFor="b-import">Restore from a backup</label>
        <textarea id="b-import" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste backup data here, or choose a file below" />
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Choose a backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) f.text().then(setPaste);
          }}
        />
      </div>
      {err && <p className="err">{err}</p>}
      {wipe && (
        <div className="confirm">
          <span>Delete every application and suggestion on this device? Save a backup first if you might need them.</span>
          <div className="row">
            <button className="btn" type="button" onClick={() => setWipe(false)}>Keep them</button>
            <button className="btn danger solid" type="button" onClick={onWipe}>Delete everything</button>
          </div>
        </div>
      )}
      <div className="panelfoot">
        {!wipe && <button className="btn danger" type="button" onClick={() => setWipe(true)}>Delete everything</button>}
        <div className="right">
          <button className="btn" type="button" onClick={onClose}>Close</button>
          <button className="btn primary" type="button" onClick={restore} disabled={!paste.trim()}>Restore</button>
        </div>
      </div>
    </Modal>
  );
}
