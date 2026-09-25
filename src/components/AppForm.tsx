import { useState } from "react";
import { Modal } from "./Modal";
import { STAGES } from "../stages";
import { todayISO } from "../lib/format";
import type { Application, Stage } from "../types";

type Draft = Omit<Application, "id" | "updatedAt" | "example">;

export function AppForm({ app, defaultStatus, onSave, onDelete, onClose, askDelete = false }: {
  app: Application | null;
  defaultStatus: Stage;
  onSave: (draft: Draft) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  askDelete?: boolean;
}) {
  const [d, setD] = useState<Draft>(() => ({
    company: app?.company ?? "",
    role: app?.role ?? "",
    status: app?.status ?? defaultStatus,
    oaDone: app?.oaDone ?? false,
    appliedOn: app?.appliedOn ?? (app ? "" : todayISO()),
    nextStep: app?.nextStep ?? "",
    dueOn: app?.dueOn ?? "",
    link: app?.link ?? "",
    notes: app?.notes ?? "",
  }));
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(askDelete);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.company.trim()) {
      setErr("Add a company name to save.");
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...d, company: d.company.trim(), role: d.role.trim(), oaDone: d.oaDone || d.status === "oa_done" });
    } catch {
      setErr("Couldn't save. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="ftitle" as="form" onSubmit={submit}>
      <h2 id="ftitle">{app ? `Edit ${app.company}` : "Add application"}</h2>
      <div className="grid2">
        <div className="field">
          <label htmlFor="f-company">Company</label>
          <input id="f-company" value={d.company} onChange={(e) => set("company", e.target.value)} autoComplete="off" placeholder="e.g. Northwind Bank" />
        </div>
        <div className="field">
          <label htmlFor="f-role">Role</label>
          <input id="f-role" value={d.role} onChange={(e) => set("role", e.target.value)} autoComplete="off" placeholder="e.g. Graduate Software Engineer" />
        </div>
        <div className="field">
          <label htmlFor="f-status">Stage</label>
          <select id="f-status" value={d.status} onChange={(e) => set("status", e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-applied">Applied on</label>
          <input id="f-applied" type="date" value={d.appliedOn} onChange={(e) => set("appliedOn", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-next">Next step</label>
          <input id="f-next" value={d.nextStep} onChange={(e) => set("nextStep", e.target.value)} autoComplete="off" placeholder="e.g. HackerRank test" />
        </div>
        <div className="field">
          <label htmlFor="f-due">Due by</label>
          <input id="f-due" type="date" value={d.dueOn} onChange={(e) => set("dueOn", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="f-link">Job link</label>
        <input id="f-link" type="url" value={d.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" />
      </div>
      <label className="check">
        <input id="f-oa" type="checkbox" checked={d.oaDone} onChange={(e) => set("oaDone", e.target.checked)} /> Online assessment completed
      </label>
      <div className="field">
        <label htmlFor="f-notes">Notes</label>
        <textarea id="f-notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Recruiter name, referral, feedback…" />
      </div>
      {err && <p className="err">{err}</p>}
      {confirm && app && (
        <div className="confirm">
          <span>Delete {app.company}? This can't be undone.</span>
          <div className="row">
            <button className="btn" type="button" onClick={() => setConfirm(false)}>Keep it</button>
            <button className="btn danger solid" type="button" onClick={onDelete}>Delete</button>
          </div>
        </div>
      )}
      <div className="panelfoot">
        {app && !confirm && (
          <button className="btn danger" type="button" onClick={() => setConfirm(true)}>Delete</button>
        )}
        <div className="right">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
