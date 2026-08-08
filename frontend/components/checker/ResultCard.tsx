import { useState } from "react";
import { MoleculeView } from "./MoleculeView";
import { VerifiedMechanismCard, VerifiedMechanism } from "./VerifiedMechanismCard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface DrugResolved {
  name: string;
  rxcui: string | null;
  standard_name: string;
  pubchem_cid: number | null;
  smiles: string | null;
  verified_mechanisms: VerifiedMechanism[];
}

export interface InteractionSource {
  name: string;
  url: string;
}

export interface VerifiedSeverity {
  level: string;
  source: string;
}

export interface PatientContext {
  age: number | null;
  renal_function: string | null;
  hepatic_function: string | null;
  pregnant: boolean | null;
  other_conditions: string | null;
}

export type RiskLevel = "low" | "moderate" | "high" | "unknown";
export type MechanismType = "PK" | "PD" | "both" | "unknown";

export interface InteractionResult {
  drug_a: DrugResolved;
  drug_b: DrugResolved;
  risk_level: RiskLevel;
  mechanism: string;
  mechanism_type: MechanismType;
  targets_involved: string[];
  pathway: string;
  clinical_effect: string;
  recommendation: string;
  llm_summary: string;
  sources: InteractionSource[];
  verified_severity: VerifiedSeverity | null;
  patient_context_used: PatientContext | null;
  disclaimer: string;
}

function describePatientContext(pc: PatientContext): string {
  const parts: string[] = [];
  if (pc.age != null) parts.push(`age ${pc.age}`);
  if (pc.renal_function) parts.push(`renal: ${pc.renal_function}`);
  if (pc.hepatic_function) parts.push(`hepatic: ${pc.hepatic_function}`);
  if (pc.pregnant != null) parts.push(pc.pregnant ? "pregnant" : "not pregnant");
  if (pc.other_conditions) parts.push(pc.other_conditions);
  return parts.join(", ");
}

const RISK_ICON: Record<RiskLevel, string> = {
  high: "🔴", moderate: "🟡", low: "🟢", unknown: "⚪",
};

const MECHANISM_LABEL: Record<MechanismType, string> = {
  PK: "Pharmacokinetic (PK)", PD: "Pharmacodynamic (PD)", both: "PK + PD", unknown: "Unknown",
};

type RTab = "summary" | "mechanism" | "clinical" | "structures" | "sources" | "raw";
const RTABS: { id: RTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "mechanism", label: "Mechanism" },
  { id: "clinical", label: "Clinical" },
  { id: "structures", label: "Structures" },
  { id: "sources", label: "Sources" },
  { id: "raw", label: "Raw data" },
];

interface ResultCardProps {
  result: InteractionResult;
  onGoMulti?: () => void;
}

export function ResultCard({ result, onGoMulti }: ResultCardProps) {
  const [tab, setTab] = useState<RTab>("summary");
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  function exportCsv() {
    const header = "drug_a,drug_b,risk_level,verified_severity,mechanism,mechanism_type,targets_involved,pathway,clinical_effect,recommendation";
    const row = [
      result.drug_a.standard_name, result.drug_b.standard_name, result.risk_level,
      result.verified_severity ? `${result.verified_severity.level} (${result.verified_severity.source})` : "not found",
      result.mechanism, result.mechanism_type, result.targets_involved.join("; "),
      result.pathway, result.clinical_effect, result.recommendation,
    ].map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
    const blob = new Blob([`${header}\n${row}\n`], { type: "text/csv" });
    downloadBlob(blob, `${result.drug_a.standard_name}_${result.drug_b.standard_name}.csv`);
  }

  async function exportDoc(format: "pdf" | "docx") {
    setExporting(format);
    try {
      const res = await fetch(`${API_BASE}/api/export?format=${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      downloadBlob(blob, `${result.drug_a.standard_name}_${result.drug_b.standard_name}.${format}`);
    } catch {
      alert(`Could not generate the ${format.toUpperCase()} report.`);
    } finally {
      setExporting(null);
    }
  }

  function copyCitation() {
    const lines = result.sources.map((s) => `${s.name}. ${s.url}`);
    if (result.verified_severity) {
      lines.unshift("DDInter 2.0 (severity rating, CC BY-NC-SA 4.0). https://ddinter.scbdd.com");
    }
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
              <div style={{ marginBottom: 12 }}>
                {result.verified_severity ? (
                  <span className="verified-badge" style={{ fontSize: 11, padding: "4px 10px" }}>
                    ✓ Verified severity ({result.verified_severity.source}): {result.verified_severity.level.toUpperCase()}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    No DDInter-verified severity found for this pair — risk level above is AI-assessed only.
                  </span>
                )}
              </div>
              {result.patient_context_used && (
                <div className="locked-note" style={{ marginBottom: 12 }}>
                  🧑‍⚕️ Assessed with patient context: {describePatientContext(result.patient_context_used)}
                </div>
              )}
              <p className="summary-p">{result.llm_summary}</p>
              <div className="divider" />
              <div className="disclaimer">⚠ {result.disclaimer}</div>
            </div>
          )}

          {tab === "mechanism" && (
            <div className="rpanel">
              <div className="sec-title">Verified mechanism data (ChEMBL)</div>
              <div className="mech-row">
                <VerifiedMechanismCard drugName={result.drug_a.standard_name} mechanisms={result.drug_a.verified_mechanisms} />
                <VerifiedMechanismCard drugName={result.drug_b.standard_name} mechanisms={result.drug_b.verified_mechanisms} />
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
                Curated per-drug mechanism data from ChEMBL, with literature references where available.
                Coverage is inconsistent across drugs — an empty result here means ChEMBL has no
                curated entry for that drug, not that no mechanism exists.
              </p>

              <div className="divider" />

              <div className="ai-unverified-note">🤖 AI-synthesized — not independently verified</div>
              <div className="ig">
                <div className="ibox">
                  <div className="ilbl">Mechanism</div>
                  <div className="ival">{result.mechanism}</div>
                </div>
              </div>
              <div className="divider" />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className="mech-badge">{MECHANISM_LABEL[result.mechanism_type]}</span>
              </div>
              {result.targets_involved.length > 0 && (
                <>
                  <div className="ilbl" style={{ marginBottom: 6 }}>Molecular targets mentioned by the AI</div>
                  <div className="class-tags" style={{ marginBottom: 12 }}>
                    {result.targets_involved.map((t) => <span className="class-tag" key={t}>{t}</span>)}
                  </div>
                </>
              )}
              {result.pathway && (
                <>
                  <div className="ilbl" style={{ marginBottom: 6 }}>Pathway (AI narrative)</div>
                  <div className="pathway-box">{result.pathway}</div>
                </>
              )}
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

          {tab === "structures" && (
            <div className="rpanel">
              <div className="mol-row">
                <MoleculeView smiles={result.drug_a.smiles} label={result.drug_a.standard_name} />
                <MoleculeView smiles={result.drug_b.smiles} label={result.drug_b.standard_name} />
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
                2D structures from PubChem, rendered client-side with RDKit.js.
              </p>
            </div>
          )}

          {tab === "sources" && (
            <div className="rpanel">
              {result.sources.length > 0 || result.verified_severity ? (
                <div className="src-list">
                  {result.verified_severity && (
                    <div className="src-item">
                      <span className="src-name">DDInter 2.0 (severity rating, CC BY-NC-SA 4.0)</span>
                      <a className="src-url" href="https://ddinter.scbdd.com" target="_blank" rel="noreferrer">
                        https://ddinter.scbdd.com
                      </a>
                    </div>
                  )}
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
        <button className="act-btn" onClick={exportCsv}>📥 CSV</button>
        <button className="act-btn" disabled={exporting === "pdf"} onClick={() => exportDoc("pdf")}>
          📄 {exporting === "pdf" ? "Generating…" : "PDF"}
        </button>
        <button className="act-btn" disabled={exporting === "docx"} onClick={() => exportDoc("docx")}>
          📝 {exporting === "docx" ? "Generating…" : "Word"}
        </button>
        <button className="act-btn" onClick={copyCitation}>📋 Copy citation</button>
        {onGoMulti && (
          <button className="act-btn" onClick={onGoMulti}>+ Multi-drug</button>
        )}
      </div>
    </>
  );
}
