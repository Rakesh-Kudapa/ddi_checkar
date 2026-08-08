import { LLMProvider } from "../settings/SettingsPanel";
import { useDataSourceStatus } from "../../lib/useDataSourceStatus";

export type TabId = "checker" | "reports" | "druginfo" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "checker", label: "Interaction Checker" },
  { id: "reports", label: "Reports" },
  { id: "druginfo", label: "Drug Info" },
  { id: "settings", label: "Settings" },
];

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: "Anthropic",
  gemini: "Gemini",
  grok: "Grok",
};

interface TopBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  llmProvider: LLMProvider;
}

export function TopBar({ activeTab, onTabChange, llmProvider }: TopBarProps) {
  const status = useDataSourceStatus();
  const openfdaLabel = status === null ? "checking…" : status.openfda;
  const openfdaWarn = status !== null && status.openfda !== "online";

  return (
    <div className="topbar">
      <div className="logo">💊 DDI Checker <span className="logo-tag">RESEARCH</span></div>
      <div className="nav-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-tab ${activeTab === t.id ? "on" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="topbar-right">
        <div className={`tbadge ${openfdaWarn ? "warn" : ""}`} title="Live-checked every 60s">
          OpenFDA: {openfdaLabel}
        </div>
        <div className="tbadge warn">RxNav Interaction: retired</div>
        <div className="tbadge">{PROVIDER_LABELS[llmProvider]}</div>
      </div>
    </div>
  );
}
