import { useState } from "react";

/** A list of short text values: add, edit in place (click the chip), or remove. */
export function ChipInput({ id, label, values, onChange, placeholder, addLabel = "Add" }: {
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };
  const commitEdit = () => {
    if (editing === null) return;
    const v = editText.trim();
    const next = [...values];
    if (!v) next.splice(editing, 1);
    else next[editing] = v;
    onChange([...new Set(next)]);
    setEditing(null);
  };

  return (
    <div className="field">
      <label htmlFor={`${id}-add`}>{label}</label>
      {values.length > 0 ? (
        <ul className="chips" aria-label={label} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {values.map((v, i) => (
            <li className="chip" key={`${v}-${i}`}>
              {editing === i ? (
                <input
                  autoFocus
                  aria-label={`Edit ${v}`}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="chip-label"
                  title="Click to edit"
                  onClick={() => {
                    setEditing(i);
                    setEditText(v);
                  }}
                >
                  {v}
                </button>
              )}
              <button type="button" className="chip-x" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="empty-note">None yet.</span>
      )}
      <div className="chip-add">
        <input
          id={`${id}-add`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={!draft.trim()}>
          + {addLabel}
        </button>
      </div>
    </div>
  );
}
