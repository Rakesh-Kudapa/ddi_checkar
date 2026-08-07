import { useEffect, useState } from "react";
import { InteractionResult, RiskLevel } from "./ResultCard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

export interface HistorySummary {
  id: number;
  drug_a: string;
  drug_b: string;
  standard_a: string;
  standard_b: string;
  risk_level: RiskLevel;
  provider: string;
  created_at: string;
}

export function historyDetailToResult(detail: any): InteractionResult {
  return {
    drug_a: { name: detail.drug_a, rxcui: null, standard_name: detail.standard_a },
    drug_b: { name: detail.drug_b, rxcui: null, standard_name: detail.standard_b },
    risk_level: detail.risk_level,
    mechanism: detail.mechanism,
    clinical_effect: detail.clinical_effect,
    recommendation: detail.recommendation,
    llm_summary: detail.llm_summary,
    sources: detail.sources,
    disclaimer: detail.disclaimer,
  };
}

interface HistoryListProps {
  onSelect: (drugA: string, drugB: string, result: InteractionResult) => void;
  refreshKey: number;
}

export function HistoryList({ onSelect, refreshKey }: HistoryListProps) {
  const [items, setItems] = useState<HistorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/history?limit=50`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .catch(() => setError("Could not load history"));
  }, [refreshKey]);

  async function handleClick(item: HistorySummary) {
    const res = await fetch(`${API_BASE}/api/history/${item.id}`);
    if (!res.ok) return;
    const detail = await res.json();
    onSelect(item.drug_a, item.drug_b, historyDetailToResult(detail));
  }

  return (
    <div>
      <div className="ph">
        <h2>Check History</h2>
        <p>Every completed check, saved automatically — click any row to reload it</p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {items && items.length === 0 && (
        <div className="empty-note">No checks yet — run one from Pair check or Multi-drug panel.</div>
      )}
      <div className="hist-list">
        {items?.map((item) => (
          <div className="hist-item" key={item.id} onClick={() => handleClick(item)}>
            <div style={{ flex: 1 }}>
              <div className="hi-name">{item.standard_a} + {item.standard_b}</div>
              <div className="hi-meta">{item.provider}</div>
            </div>
            <span className={`hbadge hb-${item.risk_level}`}>{item.risk_level.toUpperCase()}</span>
            <div className="hi-time">{new Date(item.created_at + "Z").toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
