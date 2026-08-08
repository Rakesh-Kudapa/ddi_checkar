import { useEffect, useState } from "react";
import { TopBar, TabId } from "../components/layout/TopBar";
import { Sidebar, Mode } from "../components/layout/Sidebar";
import { PairChecker, PairSeed } from "../components/checker/PairChecker";
import { MultiDrugPanel, MultiSeed } from "../components/checker/MultiDrugPanel";
import { HistoryList } from "../components/checker/HistoryList";
import { ReportsPanel } from "../components/reports/ReportsPanel";
import { DrugInfoPanel } from "../components/druginfo/DrugInfoPanel";
import { SettingsPanel, LLMSettingsValue, loadLLMSettings } from "../components/settings/SettingsPanel";
import { InteractionResult } from "../components/checker/ResultCard";

export default function Home() {
  const [tab, setTab] = useState<TabId>("checker");
  const [mode, setMode] = useState<Mode>("pair");
  const [llm, setLlm] = useState<LLMSettingsValue>({ provider: "anthropic", apiKey: "" });
  const [pairSeed, setPairSeed] = useState<PairSeed | null>(null);
  const [multiSeed, setMultiSeed] = useState<MultiSeed | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useEffect(() => {
    setLlm(loadLLMSettings());
  }, []);

  function goToPair(drugA: string, drugB: string, result?: InteractionResult) {
    setTab("checker");
    setMode("pair");
    setPairSeed({ drugA, drugB, result, seedId: Date.now() });
  }

  function goToMulti(drugs: string[]) {
    setTab("checker");
    setMode("multi");
    setMultiSeed({ drugs, seedId: Date.now() });
  }

  function bumpHistory() {
    setHistoryRefreshKey((k) => k + 1);
  }

  return (
    <>
      <TopBar activeTab={tab} onTabChange={setTab} llmProvider={llm.provider} />
      <div className="layout">
        {tab === "checker" && (
          <Sidebar activeMode={mode} onModeChange={setMode} onQuickPair={goToPair} />
        )}
        <div className="main">
          {tab === "checker" && mode === "pair" && (
            <PairChecker llm={llm} seed={pairSeed} onGoMulti={goToMulti} onChecked={bumpHistory} />
          )}
          {tab === "checker" && mode === "multi" && (
            <MultiDrugPanel llm={llm} seed={multiSeed} onChecked={bumpHistory} />
          )}
          {tab === "checker" && mode === "history" && (
            <HistoryList onSelect={goToPair} refreshKey={historyRefreshKey} onChanged={bumpHistory} />
          )}
          {tab === "reports" && (
            <ReportsPanel onView={goToPair} refreshKey={historyRefreshKey} onChanged={bumpHistory} />
          )}
          {tab === "druginfo" && <DrugInfoPanel />}
          {tab === "settings" && <SettingsPanel value={llm} onChange={setLlm} />}
        </div>
      </div>
    </>
  );
}
