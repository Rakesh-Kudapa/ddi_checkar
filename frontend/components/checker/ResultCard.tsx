import { useState } from "react";

export interface DrugResolved {
  name: string;
  rxcui: string | null;
  standard_name: string;
}

export interface InteractionSource {
  name: string;
  url: string;
}

export type RiskLevel = "low" | "moderate" | "high" | "unknown";

export interface InteractionResult {
  drug_a: DrugResolved;
  drug_b: DrugResolved;
  risk_level: RiskLevel;
  mechanism: string;
  clinical_effect: string;
  recommendation: string;
  llm_summary: string;
  sources: InteractionSource[];
  disclaimer: string;
}

const RISK_ICON: Record<RiskLevel, string> = {
  high: "🔴", moderate: "🟡", low: "🟢", unknown: "⚪",
};

type RTab = "summary" | "mechanism" | "clinical" | "sources" | "raw";
const RTABS: { id: RTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "mechanism", label: "Mechanism" },
  { id: "clinical", label: "Clinical" },
  { id: "sources", label: "Sources" },
  { id: "raw", label: "Raw data" },
];

interface ResultCardProps {
  result: InteractionResult;
  onGoMulti?: () => void;
}

export function ResultCard({ result, onGoMulti }: ResultCardProps) {
  const [tab, setTab] = useState<RTab>("summary");

  function exportCsv() {
    const header = "drug_a,drug_b,risk_level,mechanism,clinical_effect,recommendation";
    const row = [
      result.drug_a.standard_name, result.drug_b.standard_name, result.risk_level,
      result.mechanism, result.clinical_effect, result.recommendation,
    ].map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
    const blob = new Blob([`${header}\n${row}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.drug_a.standard_name}_${result.drug_b.standard_name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyCitation() {
    const lines = result.sources.map((s) => `${s.name}. ${s.url}`);
    const text = lines.length
      ? lines.join("\n")
      : "No independently-cited sources — this result relied on the LLM's own pharmacology knowledge.";
    navigator.clipboard.writeText(text);
  }

  return (
    <>
      <div className="risk-card">
        <div className={`rh ${result.risk_level}`}>
          <div className="rh-icon">{RISK_ICON[result.risk_level]}</div>
          <div>
            <div className="rh-title">
              {result.drug_a.standard_name} + {result.drug_b.standard_name}
            </div>
            <div className="rh-meta">RxCUI {result.drug_a.rxcui} · {result.drug_b.rxcui}</div>
          </div>
          <div className="rbadge">{result.risk_level}</div>
        </div>
        <div className="rbody">
          <div className="rtabs">
            {RTABS.map((t) => (
              <button
                key={t.id}
                className={`rtab ${tab === t.id ? "on" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "summary" && (
            <div className="rpanel">
              <p className="summary-p">{result.llm_summary}</p>
              <div className="divider" />
              <div className="disclaimer">⚠ {result.disclaimer}</div>
            </div>
          )}

          {tab === "mechanism" && (
            <div className="rpanel">
              <div className="ig">
                <div className="ibox">
                  <div className="ilbl">Mechanism</div>
                  <div className="ival">{result.mechanism}</div>
                </div>
              </div>
            </div>
          )}

          {tab === "clinical" && (
            <div className="rpanel">
              <div className="ig">
                <div className="ibox">
                  <div className="ilbl">Clinical effect</div>
                  <div className="ival">{result.clinical_effect}</div>
                </div>
                <div className="ibox">
                  <div className="ilbl">Recommendation</div>
                  <div className="ival">{result.recommendation}</div>
                </div>
              </div>
            </div>
          )}

          {tab === "sources" && (
            <div className="rpanel">
              {result.sources.length > 0 ? (
                <div className="src-list">
                  {result.sources.map((s) => (
                    <div className="src-item" key={s.name}>
                      <span className="src-name">{s.name}</span>
                      <a className="src-url" href={s.url} target="_blank" rel="noreferrer">
                        {s.url}
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  No independently-cited sources found for this pair — the answer above
                  relied on the LLM's own pharmacology knowledge rather than RxNav or
                  OpenFDA data.
                </p>
              )}
            </div>
          )}

          {tab === "raw" && (
            <div className="rpanel">
              <div className="sec-title">RxNav interaction data</div>
              <div className="code-box">
                RxNav's Drug Interaction API was retired by NLM and returns no data for
                any query — there is no raw structured severity payload to show here.
                See the Sources tab for what data (if any) actually fed this result.
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="action-row">
        <button className="act-btn" onClick={exportCsv}>📥 Export CSV</button>
        <button className="act-btn" onClick={copyCitation}>📋 Copy citation</button>
        {onGoMulti && (
          <button className="act-btn" onClick={onGoMulti}>+ Multi-drug</button>
        )}
      </div>
    </>
  );
}
