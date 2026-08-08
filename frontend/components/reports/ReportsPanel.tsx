import { useEffect, useState } from "react";
import { HistorySummary, historyDetailToResult, deleteHistoryItems } from "../checker/HistoryList";
import { InteractionResult, RiskLevel } from "../checker/ResultCard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

type Filter = "all" | RiskLevel;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High risk" },
  { id: "moderate", label: "Moderate" },
  { id: "low", label: "Low risk" },
];

interface ReportsPanelProps {
  onView: (drugA: string, drugB: string, result: InteractionResult) => void;
  refreshKey: number;
  onChanged?: () => void;
}

const PAGE_SIZE = 200;

export function ReportsPanel({ onView, refreshKey, onChanged }: ReportsPanelProps) {
  const [items, setItems] = useState<HistorySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [refreshKey]);

  useEffect(() => {
    setLoadingMore(true);
    fetch(`${API_BASE}/api/history?limit=${limit}`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items); setTotal(d.total); })
      .catch(() => setItems([]))
      .finally(() => setLoadingMore(false));
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, limit]);

  const filtered = filter === "all" ? items : items.filter((i) => i.risk_level === filter);
  const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  async function handleView(item: HistorySummary) {
    const res = await fetch(`${API_BASE}/api/history/${item.id}`);
    if (!res.ok) return;
    const detail = await res.json();
    onView(item.drug_a, item.drug_b, historyDetailToResult(detail));
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filtered.forEach((i) => next.delete(i.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((i) => next.add(i.id));
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected report${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) {
      return;
    }
    const ids = Array.from(selected);
    try {
      await deleteHistoryItems(ids);
      setItems((prev) => prev.filter((i) => !selected.has(i.id)));
      setSelected(new Set());
      onChanged?.();
    } catch {
      setError("Could not delete selected reports");
    }
  }

  function exportCsv() {
    // Export the checked rows if any are selected — previously this always
    // exported the whole filtered list regardless of the checkboxes, so
    // checking a handful of rows to export "just these" silently exported
    // everything in the active filter instead.
    const source = selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered;
    const header = "drug_a,drug_b,risk_level,provider,checked_at";
    const rows = source.map((i) =>
      [i.standard_a, i.standard_b, i.risk_level, i.provider, i.created_at]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ddi_reports.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="ph">
        <h2>Interaction Reports</h2>
        <p>All checks logged — filter, export, or select rows to delete</p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="rpt-hdr">
        <div className="pill-group">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`pill ${filter === f.id ? "on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selected.size > 0 && (
            <button className="act-btn act-btn-danger" onClick={handleDeleteSelected}>
              🗑 Delete selected ({selected.size})
            </button>
          )}
          <button className="act-btn" onClick={exportCsv}>
            📥 Export CSV{selected.size > 0 ? ` (${selected.size} selected)` : ""}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 8px" }}>
        Showing {items.length} of {total} logged check{total === 1 ? "" : "s"}
        {filter !== "all" && ` (${filtered.length} match "${FILTERS.find((f) => f.id === filter)?.label}")`}
      </p>
      {filtered.length === 0 ? (
        <div className="empty-note">No checks match this filter yet.</div>
      ) : (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                <th>Drug A</th><th>Drug B</th><th>Risk</th><th>Provider</th><th>Checked</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} /></td>
                  <td>{i.standard_a}</td>
                  <td>{i.standard_b}</td>
                  <td><span className={`tag t-${i.risk_level}`}>{i.risk_level.toUpperCase()}</span></td>
                  <td>{i.provider}</td>
                  <td>{new Date(i.created_at + "Z").toLocaleString()}</td>
                  <td><button className="view-btn" onClick={() => handleView(i)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length < total && (
        <button
          className="act-btn"
          style={{ marginTop: 10 }}
          disabled={loadingMore}
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
        >
          {loadingMore ? "Loading…" : `Load ${Math.min(PAGE_SIZE, total - items.length)} more`}
        </button>
      )}
    </div>
  );
}
