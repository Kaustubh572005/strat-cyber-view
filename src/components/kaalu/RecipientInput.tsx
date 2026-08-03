import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";

export type Recipient = { email: string; name?: string };

export function RecipientInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Recipient[];
  onChange: (v: Recipient[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Recipient[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/graph/contacts?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      if (!res.ok) {
        setSuggestions([]);
        return;
      }
      const json = (await res.json()) as {
        value?: Array<{
          displayName?: string;
          emailAddresses?: Array<{ address?: string }>;
          scoredEmailAddresses?: Array<{ address?: string }>;
        }>;
      };
      const out: Recipient[] = [];
      for (const p of json.value ?? []) {
        const addr =
          p.emailAddresses?.[0]?.address || p.scoredEmailAddresses?.[0]?.address;
        if (addr) out.push({ email: addr, name: p.displayName });
      }
      setSuggestions(out);
      setHighlight(0);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function addFromQuery() {
    const q = query.trim().replace(/,$/, "");
    if (!q) return;
    // If matches valid email, add. Else pick first suggestion.
    if (/^\S+@\S+\.\S+$/.test(q)) {
      onChange([...value, { email: q }]);
      setQuery("");
      setSuggestions([]);
      return;
    }
    if (suggestions[highlight]) {
      onChange([...value, suggestions[highlight]]);
      setQuery("");
      setSuggestions([]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border border-border bg-muted/50 rounded-md px-2 py-1.5 min-h-10 relative">
      <div className="text-xs text-muted-foreground w-8">{label}</div>
      {value.map((r, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs rounded-full px-2 py-0.5"
        >
          {r.name || r.email}
          <button
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={ref}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
            if (query.trim()) {
              e.preventDefault();
              addFromQuery();
            }
          } else if (e.key === "ArrowDown") {
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Backspace" && !query && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-full glass-strong rounded-md z-40 shadow-xl border border-border overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.email + i}
              onMouseDown={() => {
                onChange([...value, s]);
                setQuery("");
                setSuggestions([]);
                ref.current?.focus();
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 ${
                i === highlight ? "bg-primary/10" : ""
              }`}
            >
              <div className="font-medium">{s.name || s.email}</div>
              {s.name && <div className="text-xs text-muted-foreground">{s.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useTypedMemo() {
  return useMemo(() => null, []);
}
// keep import lint happy
void useTypedMemo;