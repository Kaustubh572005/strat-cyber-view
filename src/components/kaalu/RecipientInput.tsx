import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Loader2 } from "lucide-react";

export type Recipient = { email: string; name?: string };

function initials(text: string) {
  const parts = text.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function RecipientInput({
  label,
  value,
  onChange,
  registerCommit,
}: {
  label: string;
  value: Recipient[];
  onChange: (v: Recipient[]) => void;
  /** Lets a parent flush whatever is still typed in the box (e.g. before send). */
  registerCommit?: (commit: () => Recipient[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  // Keep the latest state available to the imperative commit function.
  const stateRef = useRef({ query, value, suggestions, highlight });
  stateRef.current = { query, value, suggestions, highlight };

  useEffect(() => {
    const q = query.trim();
    // With an empty box we still show the most recent Outlook contacts,
    // exactly like Outlook's own recipient picker.
    if (!open && q.length < 1) {
      setLoading(false);
      return;
    }
    setLoading(q.length > 0);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch(`/api/graph/contacts?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        });
        const json = (await res.json()) as {
          people?: Array<{ name?: string; email?: string }>;
          error?: string;
        };
        setNotConnected(json.error === "not_connected");
        setSuggestions(
          (json.people ?? [])
            .filter((p) => p.email)
            .map((p) => ({ email: p.email as string, name: p.name })),
        );
        setHighlight(0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, open]);

  function add(r: Recipient, list = stateRef.current.value) {
    if (list.some((x) => x.email.toLowerCase() === r.email.toLowerCase())) return list;
    const next = [...list, r];
    onChange(next);
    return next;
  }

  /** Turns whatever is typed into a chip. Returns the resulting recipient list. */
  function commit(): Recipient[] {
    const s = stateRef.current;
    const q = s.query.trim().replace(/[,;]$/, "");
    if (!q) return s.value;
    const picked =
      s.suggestions[s.highlight] ??
      s.suggestions.find((x) => x.email.toLowerCase() === q.toLowerCase());
    let next = s.value;
    if (/^\S+@\S+\.\S+$/.test(q)) {
      next = add({ email: q }, s.value);
    } else if (picked) {
      next = add(picked, s.value);
    } else {
      return s.value;
    }
    setQuery("");
    setSuggestions([]);
    return next;
  }

  useEffect(() => {
    registerCommit?.(commit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-1 border border-border bg-muted/50 rounded-md px-2 py-1.5 min-h-10 relative">
      <div className="text-xs text-muted-foreground w-8">{label}</div>
      {value.map((r, i) => (
        <span
          key={r.email + i}
          className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs rounded-full px-2 py-0.5"
          title={r.email}
        >
          {r.name || r.email}
          <button
            type="button"
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
        placeholder={value.length ? "" : "Search people or type an email"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          commit();
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
            if (query.trim()) {
              e.preventDefault();
              commit();
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Backspace" && !query && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        className="flex-1 min-w-[140px] bg-transparent text-sm outline-none"
      />
      {loading && query.trim() && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      {open && (suggestions.length > 0 || notConnected) && (
        <div className="absolute top-full left-0 mt-1 w-full glass-strong rounded-md z-40 shadow-xl border border-border overflow-hidden max-h-72 overflow-y-auto">
          {notConnected && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Connect your Outlook account in Settings to search people.
            </div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={s.email + i}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
                setQuery("");
                setSuggestions([]);
                ref.current?.focus();
              }}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-primary/10 ${
                i === highlight ? "bg-primary/10" : ""
              }`}
            >
              <span className="h-7 w-7 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center">
                {initials(s.name || s.email)}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{s.name || s.email}</span>
                <span className="block text-xs text-muted-foreground truncate">{s.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
