import { useEffect, useState } from "react";
import { DrugInput } from "./DrugInput";
import { ResultCard, InteractionResult } from "./ResultCard";
import { LLMSettingsValue } from "../settings/SettingsPanel";

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
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck(a: string, b: string) {
    if (!a.trim() || !b.trim() || !llm.apiKey.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drug_a: a.trim(), drug_b: b.trim(),
          llm_provider: llm.provider, llm_api_key: llm.apiKey.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      setResult(await res.json());
      onChecked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!seed) return;
    setDrugA(seed.drugA);
    setDrugB(seed.drugB);
    setError(null);
    if (seed.result) {
      setResult(seed.result);
      setLoading(false);
    } else {
      runCheck(seed.drugA, seed.drugB);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.seedId]);

  const canSubmit = drugA.trim().length > 0 && drugB.trim().length > 0 && llm.apiKey.trim().length > 0 && !loading;

  return (
    <div>
      <div className="ph">
        <h2>Drug Interaction Checker</h2>
        <p>Enter two drug names to check for clinically significant interactions</p>
      </div>

      <div className="search-card">
        <div className="drug-row">
          <DrugInput label="Drug A" value={drugA} onChange={setDrugA} />
          <div className="vs">VS</div>
          <DrugInput label="Drug B" value={drugB} onChange={setDrugB} />
          <button
            className="check-btn"
            disabled={!canSubmit}
            onClick={() => runCheck(drugA, drugB)}
          >
            ⚡ {loading ? "Checking…" : "Check"}
          </button>
        </div>
      </div>

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

      {result && !loading && (
        <ResultCard result={result} onGoMulti={() => onGoMulti([drugA, drugB])} />
      )}
    </div>
  );
}
