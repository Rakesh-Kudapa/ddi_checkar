import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

interface DrugInfoResult {
  name: string;
  rxcui: string | null;
  standard_name: string;
  drug_classes: string[];
  label_excerpt: string;
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
          <div className="dp-card">
            <div className="sec-title">FDA label — drug interactions section</div>
            <div style={{ fontSize: 12, lineHeight: 1.85 }}>{info.label_excerpt}</div>
          </div>
        </>
      )}
    </div>
  );
}
