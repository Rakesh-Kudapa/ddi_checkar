import { useState } from "react";
import { MoleculeView } from "../checker/MoleculeView";
import { VerifiedMechanismCard, VerifiedMechanism } from "../checker/VerifiedMechanismCard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

interface DrugInfoResult {
  name: string;
  rxcui: string | null;
  standard_name: string;
  resolved_at: string | null;
  drug_classes: string[];
  label_excerpt: string;
  pubchem_cid: number | null;
  smiles: string | null;
  structure_retrieved_at: string | null;
  verified_mechanisms: VerifiedMechanism[];
}

export function DrugInfoPanel() {
  const [name, setName] = useState("Warfarin");
  const [info, setInfo] = useState<DrugInfoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/drug-info?name=${encodeURIComponent(name.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      setInfo(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="ph">
        <h2>Drug Information</h2>
        <p>RxCUI, drug classification (RxClass), and FDA label excerpt — real data only, no invented pharmacology fields</p>
      </div>
      <div className="search-card" style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <div className="field-label">Drug name</div>
          <input
            className="drug-in"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="e.g. Warfarin"
          />
        </div>
        <button className="check-btn" disabled={loading} onClick={lookup}>
          {loading ? "Looking up…" : "Look up"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && (
        <div className="loading"><div className="spinner" /></div>
      )}

      {info && !loading && (
        <>
          <div className="dp-grid">
            <div className="dp-card">
              <div className="dp-name">{info.standard_name}</div>
              <div className="dp-class">RxCUI {info.rxcui}</div>
              <div className="dp-row">
                <span className="dp-key">Queried as</span>
                <span className="dp-val">{info.name}</span>
              </div>
              {info.pubchem_cid && (
                <div className="dp-row">
                  <span className="dp-key">PubChem CID</span>
                  <span className="dp-val">{info.pubchem_cid}</span>
                </div>
              )}
              {info.resolved_at && (
                <div className="dp-row">
                  <span className="dp-key">RxCUI resolved</span>
                  <span className="dp-val">{info.resolved_at} UTC</span>
                </div>
              )}
              {info.structure_retrieved_at && (
                <div className="dp-row">
                  <span className="dp-key">Structure retrieved</span>
                  <span className="dp-val">{info.structure_retrieved_at} UTC</span>
                </div>
              )}
            </div>
            <div className="dp-card">
              <div className="dp-name">Drug classification</div>
              <div className="dp-class">Via RxNorm's RxClass API</div>
              {info.drug_classes.length > 0 ? (
                <div className="class-tags">
                  {info.drug_classes.map((c) => <span className="class-tag" key={c}>{c}</span>)}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>No classification found.</p>
              )}
            </div>
          </div>
          <div className="dp-card" style={{ marginBottom: 12 }}>
            <div className="sec-title">2D structure</div>
            <div className="mol-row">
              <MoleculeView smiles={info.smiles} label={info.standard_name} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="sec-title">Verified mechanism data (ChEMBL)</div>
            <VerifiedMechanismCard drugName={info.standard_name} mechanisms={info.verified_mechanisms} />
          </div>
          <div className="dp-card">
            <div className="sec-title">FDA label — drug interactions section</div>
            <div style={{ fontSize: 12, lineHeight: 1.85 }}>{info.label_excerpt}</div>
          </div>
        </>
      )}
    </div>
  );
}
