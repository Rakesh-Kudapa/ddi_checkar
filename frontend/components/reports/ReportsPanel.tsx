import { useEffect, useState } from "react";
import { HistorySummary, historyDetailToResult } from "../checker/HistoryList";
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
}

export function ReportsPanel({ onView, refreshKey }: ReportsPanelProps) {
  const [items, setItems] = useState<HistorySummary[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch(`${API_BASE}/api/history?limit=200`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, [refreshKey]);

  const filtered = filter === "all" ? items : items.filter((i) => i.risk_level === filter);

  async function handleView(item: HistorySummary) {
    const res = await fetch(`${API_BASE}/api/history/${item.id}`);
    if (!res.ok) return;
    const detail = await res.json();
    onView(item.drug_a, item.drug_b, historyDetailToResult(detail));
  }

  function exportCsv() {
    const header = "drug_a,drug_b,risk_level,provider,checked_at";
    const rows = filtered.map((i) =>
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
        <p>All checks logged — filter and export</p>
      </div>
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
        <button className="act-btn" onClick={exportCsv}>📥 Export CSV</button>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-note">No checks match this filter yet.</div>
      ) : (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th>Drug A</th><th>Drug B</th><th>Risk</th><th>Provider</th><th>Checked</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
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
    </div>
  );
}
