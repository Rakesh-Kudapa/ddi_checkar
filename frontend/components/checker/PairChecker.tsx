import { useEffect, useRef, useState } from "react";
import { DrugInput } from "./DrugInput";
import { ResultCard, InteractionResult, PatientContext } from "./ResultCard";
import { PatientContextForm, EMPTY_PATIENT_CONTEXT } from "./PatientContextForm";
import { LLMSettingsValue } from "../settings/SettingsPanel";
import { clientIdHeader } from "../../lib/clientId";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

export interface PairSeed {
  drugA: string;
  drugB: string;
  result?: InteractionResult;
  seedId: number;
}

interface PairCheckerProps {
  llm: LLMSettingsValue;
  seed: PairSeed | null;
  onGoMulti: (drugs: string[]) => void;
  onChecked?: () => void;
}

export function PairChecker({ llm, seed, onGoMulti, onChecked }: PairCheckerProps) {
  const [drugA, setDrugA] = useState("");
  const [drugB, setDrugB] = useState("");
  const [patientContext, setPatientContext] = useState<PatientContext>(EMPTY_PATIENT_CONTEXT);
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function runCheck(a: string, b: string) {
    if (!a.trim() || !b.trim() || !llm.apiKey.trim()) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setStopped(false);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clientIdHeader() },
        body: JSON.stringify({
          drug_a: a.trim(), drug_b: b.trim(),
          llm_provider: llm.provider, llm_api_key: llm.apiKey.trim(),
          patient_context: patientContext,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      setResult(await res.json());
      onChecked?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Aborting the fetch also disconnects the backend's request, which
        // cancels the in-flight work server-side (including a Gemini/
        // Anthropic/Grok call already in progress) — see _run_cancelable
        // in backend/routers/interaction.py. Not an error, so no red banner.
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

  useEffect(() => {
    if (!seed) return;
    // Loading a history item, a Sidebar quick-pair, or a Multi-drug cell all
    // land here. If the user has typed something of their own that hasn't
    // been checked yet, confirm before silently discarding it.
    const hasUnsavedTyping =
      !loading && !result && (drugA.trim() || drugB.trim()) &&
      (drugA !== seed.drugA || drugB !== seed.drugB);
    if (hasUnsavedTyping && !window.confirm("Discard your in-progress drug entry and load this instead?")) {
      return;
    }
    abortRef.current?.abort();   // cancel any check still in flight for the previous seed
    setDrugA(seed.drugA);
    setDrugB(seed.drugB);
    setError(null);
    setStopped(false);
    // Previously left whatever patient context was set for the LAST check in
    // place — so reopening an unrelated pair silently sent stale age/renal/
    // pregnancy data along with it. Restore what was actually used for a
    // loaded result, or clear it for a fresh quick-pair.
    setPatientContext(seed.result?.patient_context_used ?? EMPTY_PATIENT_CONTEXT);
    // A Sidebar quick-pair or a "+ Multi-drug" jump only fills the fields —
    // it never auto-runs a check. Reported 2026-08-08: pre-filled drugs were
    // firing an LLM call with no explicit user action, wasting tokens on
    // checks nobody asked to run yet. Only a loaded History/Reports result
    // (which already exists, no new call needed) populates the result view;
    // otherwise the user reviews the fields and clicks "Check" themselves.
    setResult(seed.result ?? null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.seedId]);

  const sameDrug = drugA.trim().length > 0 && drugA.trim().toLowerCase() === drugB.trim().toLowerCase();
  const canSubmit = drugA.trim().length > 0 && drugB.trim().length > 0 && !sameDrug && llm.apiKey.trim().length > 0 && !loading;

  return (
    <div>
      <div className="ph">
        <h2>Drug Interaction Checker</h2>
        <p>Enter two drug names to check for clinically significant interactions</p>
      </div>

      <form
        className="search-card"
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) runCheck(drugA, drugB); }}
      >
        <div className="drug-row">
          <DrugInput label="Drug A" value={drugA} onChange={setDrugA} />
          <div className="vs">VS</div>
          <DrugInput label="Drug B" value={drugB} onChange={setDrugB} />
          {loading ? (
            <button type="button" className="check-btn stop-btn" onClick={stopCheck}>
              ⏹ Stop
            </button>
          ) : (
            <button type="submit" className="check-btn" disabled={!canSubmit}>
              ⚡ Check
            </button>
          )}
        </div>
        {sameDrug && (
          <p className="hint-warning" style={{ marginTop: 8, marginBottom: 0 }}>
            Drug A and Drug B are the same — enter two different drugs to check.
          </p>
        )}
      </form>

      <PatientContextForm value={patientContext} onChange={setPatientContext} />

      {!llm.apiKey.trim() && (
        <p className="hint-warning">Add an API key in Settings before running a check.</p>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Resolving drug names, fetching label data, and synthesizing a result…
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {stopped && !loading && (
        <div className="locked-note">⏹ Check stopped — no result was generated, no tokens spent past that point.</div>
      )}

      {result && !loading && (
        <ResultCard result={result} onGoMulti={() => onGoMulti([drugA, drugB])} />
      )}
    </div>
  );
}
