import { useState } from "react";
import { PatientContext } from "./ResultCard";

export const EMPTY_PATIENT_CONTEXT: PatientContext = {
  age: null, renal_function: null, hepatic_function: null, pregnant: null, other_conditions: null,
};

interface PatientContextFormProps {
  value: PatientContext;
  onChange: (v: PatientContext) => void;
}

const RENAL_OPTIONS = ["", "Normal", "Mild impairment", "Moderate impairment", "Severe impairment", "Dialysis"];
const HEPATIC_OPTIONS = ["", "Normal", "Mild impairment", "Moderate impairment", "Severe impairment"];

const MAX_AGE = 120;

function summarize(pc: PatientContext): string {
  const parts: string[] = [];
  if (pc.age != null) parts.push(`age ${pc.age}`);
  if (pc.renal_function) parts.push(`renal: ${pc.renal_function}`);
  if (pc.hepatic_function) parts.push(`hepatic: ${pc.hepatic_function}`);
  if (pc.pregnant != null) parts.push(pc.pregnant ? "pregnant" : "not pregnant");
  if (pc.other_conditions) parts.push(pc.other_conditions);
  return parts.join(", ");
}

export function PatientContextForm({ value, onChange }: PatientContextFormProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarize(value);

  function update(patch: Partial<PatientContext>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="search-card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="act-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "▾" : "▸"} Patient context (optional)
        </button>
        {!expanded && summary && (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            Currently set: {summary} — this will be sent with the next check
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", margin: expanded ? "10px 0" : 0 }}>
        {expanded && "Makes the AI's answer more personalized, not more verified — same AI-synthesized " +
          "tier as the mechanism/pathway narrative, just richer input."}
      </p>
      {expanded && (
        <div className="ig">
          <div>
            <div className="field-label">Age</div>
            <input
              className="drug-in" type="number" min={0} max={MAX_AGE} value={value.age ?? ""}
              onChange={(e) => {
                if (!e.target.value) { update({ age: null }); return; }
                const n = Math.max(0, Math.min(MAX_AGE, Number(e.target.value)));
                update({ age: n });
              }}
            />
          </div>
          <div>
            <div className="field-label">Renal function</div>
            <select
              className="set-select" value={value.renal_function ?? ""}
              onChange={(e) => update({ renal_function: e.target.value || null })}
            >
              {RENAL_OPTIONS.map((o) => <option key={o} value={o}>{o || "Not specified"}</option>)}
            </select>
          </div>
          <div>
            <div className="field-label">Hepatic function</div>
            <select
              className="set-select" value={value.hepatic_function ?? ""}
              onChange={(e) => update({ hepatic_function: e.target.value || null })}
            >
              {HEPATIC_OPTIONS.map((o) => <option key={o} value={o}>{o || "Not specified"}</option>)}
            </select>
          </div>
          <div>
            <div className="field-label">Pregnant</div>
            <select
              className="set-select"
              value={value.pregnant === null ? "" : value.pregnant ? "yes" : "no"}
              onChange={(e) => update({ pregnant: e.target.value === "" ? null : e.target.value === "yes" })}
            >
              <option value="">Not specified</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="field-label">Other conditions</div>
            <input
              className="drug-in" value={value.other_conditions ?? ""}
              placeholder="e.g. type 2 diabetes, hypertension"
              onChange={(e) => update({ other_conditions: e.target.value || null })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
