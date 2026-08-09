import { useEffect, useRef, useState } from "react";
import { InteractionResult, RiskLevel, ResultCard, PatientContext } from "./ResultCard";
import { PatientContextForm, EMPTY_PATIENT_CONTEXT } from "./PatientContextForm";
import { LLMSettingsValue } from "../settings/SettingsPanel";
import { clientIdHeader } from "../../lib/clientId";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";
const MAX_DRUGS = 12;

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
  const [patientContext, setPatientContext] = useState<PatientContext>(EMPTY_PATIENT_CONTEXT);
  const [pairs, setPairs] = useState<InteractionResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [expanded, setExpanded] = useState<InteractionResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!seed) return;
    const lowerSeen = new Set<string>();
    setDrugs(
      seed.drugs
        .filter((d) => d.trim())
        .filter((d) => (lowerSeen.has(d.toLowerCase()) ? false : (lowerSeen.add(d.toLowerCase()), true)))
        .slice(0, MAX_DRUGS)
    );
    setPairs(null);
    setExpanded(null);
    setError(null);
    // Same bug as PairChecker: previously left the last panel's patient
    // context in place for an unrelated new panel — clear it here too.
    setPatientContext(EMPTY_PATIENT_CONTEXT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.seedId]);

  function addDrug() {
    const d = newDrug.trim();
    if (!d || drugs.length >= MAX_DRUGS) return;
    if (drugs.some((x) => x.toLowerCase() === d.toLowerCase())) return;
    setDrugs([...drugs, d]);
    setNewDrug("");
  }

  function removeDrug(d: string) {
    setDrugs(drugs.filter((x) => x !== d));
  }

  async function checkAllPairs() {
    if (drugs.length < 2 || !llm.apiKey.trim()) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setStopped(false);
    setPairs(null);
    setExpanded(null);
    try {
      const res = await fetch(`${API_BASE}/api/check-multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clientIdHeader() },
        body: JSON.stringify({
          drugs, llm_provider: llm.provider, llm_api_key: llm.apiKey.trim(),
          patient_context: patientContext,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setPairs(data.pairs);
      onChecked?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // See PairChecker.tsx / backend's _run_cancelable — this cancels
        // whichever pair checks are still in flight server-side too, not
        // just the browser's wait.
        setStopped(true);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stopCheck() {
    abortRef.current?.abort();
  }

  function findPair(a: string, b: string): InteractionResult | undefined {
    return pairs?.find(
      (p) =>
        (p.drug_a.name === a && p.drug_b.name === b) ||
        (p.drug_a.name === b && p.drug_b.name === a)
    );
  }

  // Matches ResultCard's headline logic: when verified severity and AI risk
  // level disagree, the more severe of the two leads — see
  // backend/services/severity.py.
  function headlineOf(p: InteractionResult): RiskLevel {
    return p.severity_comparison?.display_level ?? p.risk_level;
  }

  const counts: Record<RiskLevel, number> = { high: 0, moderate: 0, low: 0, unknown: 0 };
  pairs?.forEach((p) => counts[headlineOf(p)]++);

  const canSubmit = drugs.length >= 2 && llm.apiKey.trim().length > 0 && !loading;
  const totalPairs = drugs.length * (drugs.length - 1) / 2;

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
        {loading ? (
          <button className="check-btn stop-btn" onClick={stopCheck}>⏹ Stop</button>
        ) : (
          <button className="check-btn" disabled={!canSubmit} onClick={checkAllPairs}>
            ⚡ Check All Pairs
          </button>
        )}
      </div>

      <PatientContextForm value={patientContext} onChange={setPatientContext} />

      {!llm.apiKey.trim() && (
        <p className="hint-warning">Add an API key in Settings before running a check.</p>
      )}
      {drugs.length >= MAX_DRUGS - 2 && drugs.length <= MAX_DRUGS && (
        <p className="hint-warning">
          Max {MAX_DRUGS} drugs per panel ({totalPairs} pairs — a panel this size can take
          several minutes since pairs are processed in bounded batches, not all at once).
        </p>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Running {totalPairs} pairwise check{totalPairs === 1 ? "" : "s"}
            {totalPairs > 15 ? " — large panels may take several minutes, processed in bounded batches" : ""}…
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {stopped && !loading && (
        <div className="locked-note">
          ⏹ Check stopped — any pairs still in flight or not yet started were cancelled
          server-side. Pairs that had already finished before you stopped did spend tokens,
          but this batch's results aren't saved or shown (all-or-nothing per request) — re-run
          if you need them.
        </div>
      )}

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
                      const headline = headlineOf(p);
                      return (
                        <td
                          key={colDrug}
                          className={`m-${headline}`}
                          onClick={() => setExpanded(p)}
                        >
                          {headline.toUpperCase()}
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

          {expanded && <ResultCard result={expanded} />}
        </>
      )}
    </div>
  );
}
