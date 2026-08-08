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
    drug_a: detail.drug_a,
    drug_b: detail.drug_b,
    risk_level: detail.risk_level,
    mechanism: detail.mechanism,
    mechanism_type: detail.mechanism_type,
    targets_involved: detail.targets_involved,
    pathway: detail.pathway,
    clinical_effect: detail.clinical_effect,
    recommendation: detail.recommendation,
    llm_summary: detail.llm_summary,
    sources: detail.sources,
    disclaimer: detail.disclaimer,
  };
}

export async function deleteHistoryItems(ids: number[]): Promise<number> {
  const res = await fetch(`${API_BASE}/api/history`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Delete failed");
  const data = await res.json();
  return data.deleted;
}

interface HistoryListProps {
  onSelect: (drugA: string, drugB: string, result: InteractionResult) => void;
  refreshKey: number;
  onChanged?: () => void;
}

export function HistoryList({ onSelect, refreshKey, onChanged }: HistoryListProps) {
  const [items, setItems] = useState<HistorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`${API_BASE}/api/history?limit=50`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .catch(() => setError("Could not load history"));
    setSelected(new Set());
  }, [refreshKey]);

  async function handleClick(item: HistorySummary) {
    const res = await fetch(`${API_BASE}/api/history/${item.id}`);
    if (!res.ok) return;
    const detail = await res.json();
    onSelect(item.drug_a, item.drug_b, historyDetailToResult(detail));
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected check${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) {
      return;
    }
    const ids = Array.from(selected);
    try {
      await deleteHistoryItems(ids);
      setItems((prev) => prev?.filter((i) => !selected.has(i.id)) ?? null);
      setSelected(new Set());
      onChanged?.();
    } catch {
      setError("Could not delete selected checks");
    }
  }

  return (
    <div>
      <div className="ph">
        <h2>Check History</h2>
        <p>Every completed check, saved automatically — click a row to reload it, or select checkboxes to delete</p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {items && items.length === 0 && (
        <div className="empty-note">No checks yet — run one from Pair check or Multi-drug panel.</div>
      )}
      {selected.size > 0 && (
        <div className="action-row">
          <button className="act-btn act-btn-danger" onClick={handleDeleteSelected}>
            🗑 Delete selected ({selected.size})
          </button>
        </div>
      )}
      <div className="hist-list">
        {items?.map((item) => (
          <div className="hist-item" key={item.id}>
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              onClick={(e) => e.stopPropagation()}
            />
            <div style={{ flex: 1, cursor: "pointer" }} onClick={() => handleClick(item)}>
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
