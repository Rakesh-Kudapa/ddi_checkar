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

export function PatientContextForm({ value, onChange }: PatientContextFormProps) {
  const [expanded, setExpanded] = useState(false);

  function update(patch: Partial<PatientContext>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="search-card" style={{ marginBottom: 14 }}>
      <button
        type="button"
        className="act-btn"
        onClick={() => setExpanded(!expanded)}
        style={{ marginBottom: expanded ? 12 : 0 }}
      >
        {expanded ? "▾" : "▸"} Patient context (optional)
      </button>
      <p style={{ fontSize: 11, color: "var(--muted)", margin: expanded ? "0 0 10px" : 0 }}>
        Makes the AI's answer more personalized, not more verified — same AI-synthesized
        tier as the mechanism/pathway narrative, just richer input.
      </p>
      {expanded && (
        <div className="ig">
          <div>
            <div className="field-label">Age</div>
            <input
              className="drug-in" type="number" min={0} value={value.age ?? ""}
              onChange={(e) => update({ age: e.target.value ? Number(e.target.value) : null })}
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
