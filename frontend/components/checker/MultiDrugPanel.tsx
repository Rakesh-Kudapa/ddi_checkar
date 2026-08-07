import { useEffect, useState } from "react";
import { InteractionResult, RiskLevel } from "./ResultCard";
import { LLMSettingsValue } from "../settings/SettingsPanel";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";
const MAX_DRUGS = 6;

export interface MultiSeed {
  drugs: string[];
  seedId: number;
}

interface MultiDrugPanelProps {
  llm: LLMSettingsValue;
  seed: MultiSeed | null;
  onChecked?: () => void;
}

export function MultiDrugPanel({ llm, seed, onChecked }: MultiDrugPanelProps) {
  const [drugs, setDrugs] = useState<string[]>(["Warfarin", "Aspirin"]);
  const [newDrug, setNewDrug] = useState("");
  const [pairs, setPairs] = useState<InteractionResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<InteractionResult | null>(null);

  useEffect(() => {
    if (!seed) return;
    setDrugs(seed.drugs.filter((d, i, arr) => d.trim() && arr.indexOf(d) === i).slice(0, MAX_DRUGS));
    setPairs(null);
    setExpanded(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.seedId]);

  function addDrug() {
    const d = newDrug.trim();
    if (!d || drugs.includes(d) || drugs.length >= MAX_DRUGS) return;
    setDrugs([...drugs, d]);
    setNewDrug("");
  }

  function removeDrug(d: string) {
    setDrugs(drugs.filter((x) => x !== d));
  }

  async function checkAllPairs() {
    if (drugs.length < 2 || !llm.apiKey.trim()) return;
    setLoading(true);
    setError(null);
    setPairs(null);
    setExpanded(null);
    try {
      const res = await fetch(`${API_BASE}/api/check-multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drugs, llm_provider: llm.provider, llm_api_key: llm.apiKey.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setPairs(data.pairs);
      onChecked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function findPair(a: string, b: string): InteractionResult | undefined {
    return pairs?.find(
      (p) =>
        (p.drug_a.name === a && p.drug_b.name === b) ||
        (p.drug_a.name === b && p.drug_b.name === a)
    );
  }

  const counts: Record<RiskLevel, number> = { high: 0, moderate: 0, low: 0, unknown: 0 };
  pairs?.forEach((p) => counts[p.risk_level]++);

  const canSubmit = drugs.length >= 2 && llm.apiKey.trim().length > 0 && !loading;

  return (
    <div>
      <div className="ph">
        <h2>Multi-Drug Panel</h2>
        <p>Check all pairwise interactions across a drug list at once (up to {MAX_DRUGS} drugs)</p>
      </div>

      <div className="search-card">
        <div className="chip-row">
          {drugs.map((d) => (
            <div className="dchip" key={d}>
              {d}
              <button className="dchip-x" onClick={() => removeDrug(d)}>✕</button>
            </div>
          ))}
        </div>
        <div className="chip-add-row">
          <input
            className="drug-in"
            placeholder="Add a drug name"
            value={newDrug}
            onChange={(e) => setNewDrug(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDrug()}
          />
          <button className="act-btn" onClick={addDrug} disabled={drugs.length >= MAX_DRUGS}>+ Add</button>
        </div>
        <button className="check-btn" disabled={!canSubmit} onClick={checkAllPairs}>
          ⚡ {loading ? "Checking all pairs…" : "Check All Pairs"}
        </button>
      </div>

      {!llm.apiKey.trim() && (
        <p className="hint-warning">Add an API key in Settings before running a check.</p>
      )}
      {drugs.length > MAX_DRUGS - 1 && drugs.length <= MAX_DRUGS && (
        <p className="hint-warning">Max {MAX_DRUGS} drugs per panel ({drugs.length * (drugs.length - 1) / 2} pairs).</p>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Running {drugs.length * (drugs.length - 1) / 2} pairwise checks concurrently…
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {pairs && !loading && (
        <>
          <div className="sec-title">
            Interaction Matrix <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— click any cell for full details</span>
          </div>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th></th>
                  {drugs.map((d) => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {drugs.map((rowDrug) => (
                  <tr key={rowDrug}>
                    <td>{rowDrug}</td>
                    {drugs.map((colDrug) => {
                      if (rowDrug === colDrug) return <td key={colDrug} className="m-self">—</td>;
                      const p = findPair(rowDrug, colDrug);
                      if (!p) return <td key={colDrug} className="m-unknown">—</td>;
                      return (
                        <td
                          key={colDrug}
                          className={`m-${p.risk_level}`}
                          onClick={() => setExpanded(p)}
                        >
                          {p.risk_level.toUpperCase()}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stat-row">
            <div className="stat">
              <div className="stat-val" style={{ color: "var(--danger)" }}>{counts.high}</div>
              <div className="stat-lbl">High risk pairs</div>
            </div>
            <div className="stat">
              <div className="stat-val" style={{ color: "var(--warn)" }}>{counts.moderate}</div>
              <div className="stat-lbl">Moderate pairs</div>
            </div>
            <div className="stat">
              <div className="stat-val" style={{ color: "var(--green)" }}>{counts.low}</div>
              <div className="stat-lbl">Low risk pairs</div>
            </div>
            <div className="stat">
              <div className="stat-val">{pairs.length}</div>
              <div className="stat-lbl">Total pairs · {drugs.length} drugs</div>
            </div>
          </div>

          {expanded && (
            <div className="risk-card">
              <div className={`rh ${expanded.risk_level}`}>
                <div className="rh-icon">
                  {expanded.risk_level === "high" ? "🔴" : expanded.risk_level === "moderate" ? "🟡" : expanded.risk_level === "low" ? "🟢" : "⚪"}
                </div>
                <div>
                  <div className="rh-title">{expanded.drug_a.standard_name} + {expanded.drug_b.standard_name}</div>
                </div>
                <div className="rbadge">{expanded.risk_level}</div>
              </div>
              <div className="rbody">
                <div className="rpanel">
                  <p className="summary-p">{expanded.llm_summary}</p>
                  <div className="divider" />
                  <div className="ig">
                    <div className="ibox"><div className="ilbl">Mechanism</div><div className="ival">{expanded.mechanism}</div></div>
                    <div className="ibox"><div className="ilbl">Recommendation</div><div className="ival">{expanded.recommendation}</div></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
