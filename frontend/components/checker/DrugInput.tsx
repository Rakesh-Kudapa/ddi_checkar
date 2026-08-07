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
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

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
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && suggestions.length > 0 && (
          <div className="ac-drop">
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
