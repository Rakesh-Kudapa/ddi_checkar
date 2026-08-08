import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";
const POLL_MS = 60000;

export interface DataSourceStatus {
  rxnorm: string;
  openfda: string;
  pubchem: string;
  chembl: string;
  ddinter: string;
  rxnav_interaction: string;
}

// Replaces what used to be hardcoded "online" strings in TopBar/SettingsPanel
// — those stayed "online" even during a real outage, which is misleading
// exactly when a status badge is supposed to help. Polled every 60s rather
// than on every render/check to keep this cheap; `null` means "not checked
// yet" (or the check itself failed), distinct from a source reporting itself
// unreachable.
export function useDataSourceStatus(): DataSourceStatus | null {
  const [status, setStatus] = useState<DataSourceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // leave the last-known status in place rather than flashing to
        // "unknown" on one transient failed poll
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return status;
}
