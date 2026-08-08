import { useEffect, useState } from "react";

const RDKIT_SCRIPT_URL = "https://unpkg.com/@rdkit/rdkit/dist/RDKit_minimal.js";

declare global {
  interface Window {
    initRDKitModule?: () => Promise<any>;
    RDKit?: any;
    __rdkitLoadPromise?: Promise<any>;
  }
}

function loadRdkit(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("RDKit can only load in the browser"));
  }
  if (window.RDKit) return Promise.resolve(window.RDKit);
  if (window.__rdkitLoadPromise) return window.__rdkitLoadPromise;

  window.__rdkitLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RDKIT_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      window
        .initRDKitModule!()
        .then((rdkit) => {
          window.RDKit = rdkit;
          resolve(rdkit);
        })
        .catch(reject);
    };
    script.onerror = () => reject(new Error("Failed to load RDKit.js from unpkg"));
    document.head.appendChild(script);
  });

  return window.__rdkitLoadPromise;
}

interface UseRdkitResult {
  rdkit: any | null;
  loading: boolean;
  error: string | null;
}

export function useRdkit(): UseRdkitResult {
  const [rdkit, setRdkit] = useState<any | null>(typeof window !== "undefined" ? window.RDKit || null : null);
  const [loading, setLoading] = useState(!rdkit);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rdkit) return;
    let cancelled = false;
    setLoading(true);
    loadRdkit()
      .then((mod) => {
        if (!cancelled) {
          setRdkit(mod);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load RDKit.js");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rdkit, loading, error };
}
