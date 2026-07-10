import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSebiCirculars, summarizeRegItem, type RegItem } from "@/lib/regulatory.functions";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText, Filter, ExternalLink, Sparkles, Search, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sebi")({
  component: SebiPage,
});

const CATEGORIES = [
  "All",
  "Cybersecurity",
  "Compliance",
  "Mutual Funds",
  "Brokers",
  "Depositories",
  "Market Infrastructure",
  "General",
];

function SebiPage() {
  const getFn = useServerFn(getSebiCirculars);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sebi-circulars"],
    queryFn: () => getFn(),
    staleTime: 5 * 60 * 1000,
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((i) => {
      if (cat !== "All" && i.category !== cat) return false;
      if (ql && !`${i.title} ${i.snippet}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [items, q, cat]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Regulatory Intelligence</div>
          <h1 className="text-3xl font-semibold neon-text mt-1 flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> SEBI Circulars
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Latest circulars and notifications from the Securities and Exchange Board of India.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total tracked" value={data?.kpis.total ?? 0} />
        <Kpi label="Published today" value={data?.kpis.today ?? 0} />
        <Kpi label="Cybersecurity" value={data?.kpis.cyber ?? 0} accent />
        <Kpi label="Compliance" value={data?.kpis.compliance ?? 0} />
      </div>

      <div className="glass rounded-xl p-4 border border-white/5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search circulars…" className="h-8 pl-8 bg-white/5 border-white/10" />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`text-[11px] px-2 py-1 rounded border transition ${
                cat === c
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-white/10 text-muted-foreground hover:border-white/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading circulars…</div>}
      {!isLoading && filtered.length === 0 && (
        <div className="glass rounded-xl p-6 border border-white/5 text-sm text-muted-foreground">
          No circulars matched your filters. Try clearing the search or category.
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((it) => (
          <CircularCard key={it.id} item={it} />
        ))}
      </div>

      <div className="text-[11px] text-muted-foreground pt-2">
        Sourced from{" "}
        <a href="https://www.sebi.gov.in" target="_blank" rel="noreferrer" className="underline hover:text-primary">
          sebi.gov.in
        </a>
        {data?.updatedAt && <> · Updated {new Date(data.updatedAt).toLocaleTimeString()}</>}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`glass rounded-xl p-4 border ${accent ? "border-primary/40" : "border-white/5"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function CircularCard({ item }: { item: RegItem }) {
  const [showAi, setShowAi] = useState(false);
  const summarize = useServerFn(summarizeRegItem);
  const { data: ai, isFetching } = useQuery({
    queryKey: ["reg-ai", item.id],
    queryFn: () => summarize({ data: { title: item.title, snippet: item.snippet, source: item.source } }),
    enabled: showAi,
    staleTime: 30 * 60 * 1000,
  });
  return (
    <article className="glass rounded-xl p-4 border border-white/5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{item.category}</span>
        <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
        <span>·</span>
        <span>{item.source}</span>
      </div>
      <h2 className="text-base font-medium leading-snug">{item.title}</h2>
      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.snippet || "—"}</p>
      {showAi && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          {isFetching || !ai ? (
            <span className="text-muted-foreground">Analyzing with Kaalu AI…</span>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-widest text-primary mb-1">AI Summary</div>
              <p>{ai.summary}</p>
              <div className="text-[10px] uppercase tracking-widest text-primary mt-2 mb-1">Impact</div>
              <p className="text-muted-foreground">{ai.impact}</p>
            </>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.link && (
          <a href={item.link} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
            Open original <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAi((v) => !v)}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> {showAi ? "Hide AI summary" : "AI summary"}
        </Button>
      </div>
    </article>
  );
}