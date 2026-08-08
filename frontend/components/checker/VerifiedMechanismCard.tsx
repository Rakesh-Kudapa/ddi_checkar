export interface MechanismReference {
  ref_type: string;
  ref_url: string;
}

export interface VerifiedMechanism {
  target: string;
  action_type: string | null;
  mechanism_of_action: string;
  references: MechanismReference[];
}

interface VerifiedMechanismCardProps {
  drugName: string;
  mechanisms: VerifiedMechanism[];
}

export function VerifiedMechanismCard({ drugName, mechanisms }: VerifiedMechanismCardProps) {
  if (mechanisms.length === 0) {
    return (
      <div className="mech-card mech-card-empty">
        <div className="mech-card-title">{drugName}</div>
        <p style={{ fontSize: 11, color: "var(--muted)" }}>
          No independently verified mechanism found in ChEMBL for {drugName}.
        </p>
      </div>
    );
  }

  return (
    <div className="mech-card">
      <div className="mech-card-title">
        {drugName}
        <span className="verified-badge">✓ Verified — ChEMBL</span>
      </div>
      {mechanisms.map((m, i) => (
        <div key={i} style={{ marginTop: i > 0 ? 10 : 4 }}>
          <div className="ilbl">Target</div>
          <div className="ival">{m.target}{m.action_type ? ` (${m.action_type})` : ""}</div>
          <div className="ilbl" style={{ marginTop: 6 }}>Mechanism of action</div>
          <div className="ival">{m.mechanism_of_action}</div>
          {m.references.length > 0 && (
            <div className="mech-refs">
              {m.references.map((r, j) => (
                <a key={j} href={r.ref_url} target="_blank" rel="noreferrer">{r.ref_type}</a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
