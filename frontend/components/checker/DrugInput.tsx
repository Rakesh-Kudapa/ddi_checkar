import { useEffect, useRef, useState, KeyboardEvent } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8743";

interface DrugInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

export function DrugInput({ label, value, onChange }: DrugInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
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
        setHighlight(-1);
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

  function pick(s: string) {
    onChange(s);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { close(); return; }
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === "Enter" && highlight >= 0) {
      // Only intercept Enter when a suggestion is actively highlighted —
      // otherwise let it bubble to the surrounding form's submit (Pair
      // Checker's "Check" button), so Enter reliably runs a check too.
      e.preventDefault();
      pick(suggestions[highlight]);
    }
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
          onKeyDown={handleKeyDown}
        />
        {open && suggestions.length > 0 && (
          <div className="ac-drop">
            <div className="ac-drop-hdr">
              <span>Suggestions (↑↓ to navigate, Enter to pick)</span>
              <button className="ac-drop-close" onMouseDown={(e) => { e.preventDefault(); close(); }}>✕</button>
            </div>
            {suggestions.map((s, i) => (
              <div
                key={s}
                className={`ac-opt ${i === highlight ? "hl" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={() => pick(s)}
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
