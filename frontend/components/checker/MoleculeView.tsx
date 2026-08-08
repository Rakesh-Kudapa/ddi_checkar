import { useEffect, useMemo, useState } from "react";
import { useRdkit } from "../../lib/useRdkit";

interface MoleculeViewProps {
  smiles: string | null;
  label: string;
}

export function MoleculeView({ smiles, label }: MoleculeViewProps) {
  const { rdkit, loading, error } = useRdkit();
  const [svgError, setSvgError] = useState<string | null>(null);

  const svg = useMemo(() => {
    if (!rdkit || !smiles) return null;
    let mol;
    try {
      mol = rdkit.get_mol(smiles);
      if (!mol || !mol.is_valid()) {
        setSvgError("Could not parse this molecule's structure");
        return null;
      }
      return mol.get_svg(240, 200);
    } catch {
      setSvgError("Could not render this molecule's structure");
      return null;
    } finally {
      mol?.delete?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdkit, smiles]);

  return (
    <div className="mol-view">
      <div className="mol-label">{label}</div>
      <div className="mol-box">
        {!smiles ? (
          <div className="mol-placeholder">Structure not found in PubChem for this drug name.</div>
        ) : loading ? (
          <div className="mol-placeholder">Loading RDKit.js…</div>
        ) : error ? (
          <div className="mol-placeholder">{error}</div>
        ) : svgError ? (
          <div className="mol-placeholder">{svgError}</div>
        ) : svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="mol-placeholder">Rendering…</div>
        )}
      </div>
    </div>
  );
}
