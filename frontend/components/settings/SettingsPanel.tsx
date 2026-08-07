import { useEffect, useState } from "react";

export type LLMProvider = "anthropic" | "gemini" | "grok";

const PROVIDERS: { id: LLMProvider; label: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "grok", label: "xAI Grok" },
];

const PROVIDER_KEY = "ddi_llm_provider";
const keyStorageKey = (provider: LLMProvider) => `ddi_llm_key_${provider}`;

export interface LLMSettingsValue {
  provider: LLMProvider;
  apiKey: string;
}

export function loadLLMSettings(): LLMSettingsValue {
  if (typeof window === "undefined") {
    return { provider: "anthropic", apiKey: "" };
  }
  const provider = (localStorage.getItem(PROVIDER_KEY) as LLMProvider) || "anthropic";
  const apiKey = localStorage.getItem(keyStorageKey(provider)) || "";
  return { provider, apiKey };
}

interface SettingsPanelProps {
  value: LLMSettingsValue;
  onChange: (val: LLMSettingsValue) => void;
}

export function SettingsPanel({ value, onChange }: SettingsPanelProps) {
  const [draftKey, setDraftKey] = useState(value.apiKey);
  const [saved, setSaved] = useState(Boolean(value.apiKey));

  useEffect(() => {
    setDraftKey(value.apiKey);
    setSaved(Boolean(value.apiKey));
  }, [value.provider]);

  function handleProviderChange(provider: LLMProvider) {
    const apiKey = localStorage.getItem(keyStorageKey(provider)) || "";
    localStorage.setItem(PROVIDER_KEY, provider);
    onChange({ provider, apiKey });
  }

  function handleSaveKey() {
    localStorage.setItem(keyStorageKey(value.provider), draftKey.trim());
    setSaved(Boolean(draftKey.trim()));
    onChange({ provider: value.provider, apiKey: draftKey.trim() });
  }

  return (
    <div>
      <div className="ph">
        <h2>Settings</h2>
        <p>Configure your LLM provider and review data source status</p>
      </div>
      <div className="set-grid">
        <div className="set-card">
          <div className="set-title">🔑 LLM provider &amp; API key</div>
          <div className="set-row">
            <span>Provider</span>
          </div>
          <select
            className="set-select"
            value={value.provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          <div className="set-row" style={{ marginTop: 12 }}>
            <span>API key</span>
          </div>
          <div className="save-key-row">
            <input
              className="set-input"
              type="password"
              value={draftKey}
              placeholder="Paste your API key"
              onChange={(e) => { setDraftKey(e.target.value); setSaved(false); }}
            />
            <button type="button" className="save-key" onClick={handleSaveKey}>Save</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
            {saved
              ? "Key saved in this browser only — sent per-request to the backend, which forwards it to the provider and never stores it."
              : "Not saved yet — stored in localStorage on this device only."}
          </p>
        </div>

        <div className="set-card">
          <div className="set-title">📊 Data sources</div>
          <div className="set-row">
            <span><span className="status-dot ok" />OpenFDA drug labels</span>
          </div>
          <div className="set-row">
            <span><span className="status-dot dead" />RxNav interaction API</span>
            <span className="v2-badge">RETIRED</span>
          </div>
          <div className="set-row disabled">
            <span><span className="status-dot" style={{ background: "var(--border)" }} />DrugBank</span>
            <span className="v2-badge">v2</span>
          </div>
          <div className="set-row disabled">
            <span><span className="status-dot" style={{ background: "var(--border)" }} />FAERS adverse events</span>
            <span className="v2-badge">v2</span>
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
            RxNav's Drug Interaction API was retired by NLM after it lost redistribution
            rights to its source databases — structured severity data now comes from
            OpenFDA label text plus the LLM's own pharmacology knowledge.
          </p>
        </div>

        <div className="set-card">
          <div className="set-title">📋 Disclaimer</div>
          <div className="locked-note">
            🔒 Always shown, on every result — this is a fixed project policy, not a
            configurable setting, since this tool is for research use only and never
            constitutes medical advice.
          </div>
        </div>
      </div>
    </div>
  );
}
