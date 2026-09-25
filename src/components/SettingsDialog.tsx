import { useState } from "react";
import { Modal } from "./Modal";
import { CLIENT_ID_PATTERN, DEFAULT_SKIP, ENV_CLIENT_ID } from "../settings";
import { copyText } from "../lib/format";
import type { Settings } from "../types";

export function SettingsDialog({ settings, account, onSave, onClose, onDisconnect, onResetScan, toast }: {
  settings: Settings;
  account: string;
  onSave: (s: Settings) => void;
  onClose: () => void;
  onDisconnect: () => Promise<void>;
  onResetScan: () => Promise<void>;
  toast: (m: string) => void;
}) {
  const [clientId, setClientId] = useState(settings.clientId);
  const [skip, setSkip] = useState(settings.skipKeywords.join("\n"));
  const [days, setDays] = useState(settings.firstScanDays);
  const [err, setErr] = useState("");
  const origin = window.location.origin;
  const badOrigin = !/^https?:\/\//.test(origin);
  const trimmed = clientId.trim();
  const looksValid = CLIENT_ID_PATTERN.test(trimmed);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmed && !looksValid) {
      setErr("That doesn't look like a Google client ID. It should end in .apps.googleusercontent.com.");
      return;
    }
    onSave({
      clientId: trimmed,
      skipKeywords: skip.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
      firstScanDays: days,
    });
  };

  const copyOrigin = async () => toast((await copyText(origin)) ? "Address copied" : "Select the address and copy it");

  return (
    <Modal onClose={onClose} labelledBy="stitle" as="form" onSubmit={save}>
      <h2 id="stitle">Gmail settings</h2>
      <p className="privacy">
        The app runs entirely in your browser. Your emails go straight from Google to this page and are never sent to
        any other server. Access is read-only, so the app can't send, change or delete anything in your mailbox.
      </p>

      <h3>1 · Your Google client ID</h3>
      {badOrigin && (
        <div className="banner err">
          Google sign-in doesn't work when the app is opened as a file. Run it with <code>npm run dev</code> or open the hosted site.
        </div>
      )}
      <div className="field">
        <label htmlFor="s-client">Client ID</label>
        <input
          id="s-client"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setErr("");
          }}
          placeholder="1234567890-abc123def456.apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
        />
        {ENV_CLIENT_ID && trimmed === ENV_CLIENT_ID && <span className="hint">Using the client ID this copy of the app was built with.</span>}
        {trimmed && looksValid && <span className="ok">Looks right.</span>}
      </div>

      <details open={!settings.clientId}>
        <summary>How to get a client ID (about 10 minutes, free)</summary>
        <ol className="steps">
          <li>
            Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> and create a project. Any name works, for example "Job tracker".
          </li>
          <li>
            Go to <b>APIs &amp; Services → Library</b>, search for <b>Gmail API</b> and click <b>Enable</b>.
          </li>
          <li>
            Go to <b>Google Auth Platform</b> (called "OAuth consent screen" in older menus). Click <b>Get started</b>, enter an app name and your email, choose <b>External</b>, and finish.
          </li>
          <li>
            Under <b>Audience → Test users</b>, add your own Gmail address. Only listed test users can connect.
          </li>
          <li>
            Under <b>Clients</b> (or <b>Credentials → Create credentials → OAuth client ID</b>), choose <b>Web application</b>. In <b>Authorised JavaScript origins</b> add this exact address:
            <div className="codeline">
              <code>{origin}</code>
              <button className="btn sm" type="button" onClick={copyOrigin}>Copy</button>
            </div>
            Leave redirect URIs empty and click <b>Create</b>.
          </li>
          <li>Copy the <b>Client ID</b> (it ends in <code>.apps.googleusercontent.com</code>) and paste it above.</li>
        </ol>
        <p className="hint" style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
          When you connect, Google will say it hasn't verified the app. That's expected, because it's your own private app. Click <b>Continue</b>.
          A new origin can take a few minutes to start working.
        </p>
      </details>

      <h3>2 · What to scan</h3>
      <div className="field">
        <label htmlFor="s-days">First scan looks back</label>
        <select id="s-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[14, 30, 60, 90].map((n) => (
            <option key={n} value={n}>{n} days</option>
          ))}
        </select>
        <span className="hint">Later scans only read emails since the last scan.</span>
      </div>
      <div className="field">
        <label htmlFor="s-skip">Skip emails that mention</label>
        <textarea id="s-skip" value={skip} onChange={(e) => setSkip(e.target.value)} />
        <span className="hint">
          One per line. Useful for part-time or unrelated jobs.{" "}
          <button className="linkbtn" type="button" onClick={() => setSkip(DEFAULT_SKIP.join("\n"))}>Reset to defaults</button>
        </span>
      </div>

      {account && (
        <>
          <h3>3 · Connected account</h3>
          <div className="codeline">
            <span>{account}</span>
            <button className="btn sm" type="button" onClick={onDisconnect}>Disconnect</button>
            <button className="btn sm" type="button" onClick={onResetScan}>Scan everything again</button>
          </div>
        </>
      )}

      {err && <p className="err">{err}</p>}
      <div className="panelfoot">
        <div className="right">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit">Save</button>
        </div>
      </div>
    </Modal>
  );
}
