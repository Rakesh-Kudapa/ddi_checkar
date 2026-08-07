export type Mode = "pair" | "multi" | "history";

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "pair", icon: "⇌", label: "Pair check" },
  { id: "multi", icon: "✳", label: "Multi-drug panel" },
  { id: "history", icon: "🕐", label: "History" },
];

const QUICK_PAIRS: { icon: string; a: string; b: string; label: string }[] = [
  { icon: "⚠", a: "Warfarin", b: "Aspirin", label: "Warfarin + Aspirin" },
  { icon: "⚠", a: "Simvastatin", b: "Clarithromycin", label: "Statin + Antibiotic" },
  { icon: "⚠", a: "Sertraline", b: "Tramadol", label: "SSRI + Opioid" },
  { icon: "⚠", a: "Lisinopril", b: "Ibuprofen", label: "ACE + NSAID" },
  { icon: "⚠", a: "Clopidogrel", b: "Omeprazole", label: "Clopidogrel + PPI" },
];

interface SidebarProps {
  activeMode: Mode;
  onModeChange: (mode: Mode) => void;
  onQuickPair: (a: string, b: string) => void;
}

export function Sidebar({ activeMode, onModeChange, onQuickPair }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sb-sec">Analysis mode</div>
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`sb-btn ${activeMode === m.id ? "on" : ""}`}
          onClick={() => onModeChange(m.id)}
        >
          <span className="sb-icon">{m.icon}</span>
          {m.label}
        </button>
      ))}
      <div className="sb-sec">Quick pairs</div>
      {QUICK_PAIRS.map((qp) => (
        <button key={qp.label} className="sb-btn" onClick={() => onQuickPair(qp.a, qp.b)}>
          <span className="sb-icon">{qp.icon}</span>
          {qp.label}
        </button>
      ))}
    </div>
  );
}
