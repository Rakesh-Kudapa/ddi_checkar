import { useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

interface DrugInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

export function DrugInput({ label, value, onChange }: DrugInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Tracks an explicit user dismissal (Escape / close button) so a
  // suggestion fetch that resolves afterwards doesn't silently reopen the
  // dropdown — a ref avoids stale-closure issues from the debounce timeout.
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/autocomplete?q=${encodeURIComponent(value.trim())}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        if (!dismissedRef.current) setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  function close() {
    dismissedRef.current = true;
    setOpen(false);
  }

  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="drug-wrap">
        <input
          className="drug-in"
          type="text"
          value={value}
          placeholder="e.g. Warfarin"
          autoComplete="off"
          onChange={(e) => {
            dismissedRef.current = false;
            onChange(e.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              dismissedRef.current = false;
              setOpen(true);
            }
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Escape") close(); }}
        />
        {open && suggestions.length > 0 && (
          <div className="ac-drop">
            <div className="ac-drop-hdr">
              <span>Suggestions</span>
              <button className="ac-drop-close" onMouseDown={(e) => { e.preventDefault(); close(); }}>✕</button>
            </div>
            {suggestions.map((s) => (
              <div
                key={s}
                className="ac-opt"
                onMouseDown={() => { onChange(s); setOpen(false); }}
              >
                💊 {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
