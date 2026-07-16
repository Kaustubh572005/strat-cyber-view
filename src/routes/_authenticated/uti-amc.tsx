import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArticles, refreshSource, type FeedArticle } from "@/lib/feeds.functions";
import { Shield, RefreshCw, ExternalLink, Sparkles, Search as SearchIcon, Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/uti-amc")({
  component: UtiAmcPage,
});

const INCIDENT_TYPES = [
  "ALL",
  "Data Breach",
  "Vulnerability",
  "Advisory",
  "Regulatory Disclosure",
  "Threat Intelligence",
  "News",
];

const sevColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  info: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

function UtiAmcPage() {
  const get = useServerFn(listArticles);
  const refresh = useServerFn(refreshSource);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [incidentType, setIncidentType] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [source, setSource] = useState("ALL");

  const query = useQuery({
    queryKey: ["uti-articles"],
    queryFn: () => get({ data: { source_key: "uti-amc-cyber", limit: 500 } }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: "uti-amc-cyber" } }),
    onSuccess: (r) => {
      toast.success(`UTI AMC Cyber Watch — ${r.results[0].added} new`);
      qc.invalidateQueries({ queryKey: ["uti-articles"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = query.data ?? [];
  const sources = useMemo(() => {
    const s = new Set<string>();
    items.forEach((it) => it.publisher && s.add(it.publisher));
    return ["ALL", ...Array.from(s).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter((a) => {
      if (incidentType !== "ALL" && a.category !== incidentType) return false;
      if (source !== "ALL" && a.publisher !== source) return false;
      if (dateFrom && a.published_at && new Date(a.published_at) < new Date(dateFrom)) return false;
      if (!s) return true;
      return (
        a.title.toLowerCase().includes(s) ||
        (a.snippet ?? "").toLowerCase().includes(s) ||
        (a.publisher ?? "").toLowerCase().includes(s)
      );
    });
  }, [items, q, incidentType, source, dateFrom]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Building2 className="h-3 w-3" /> UTI Asset Management Company
          </div>
          <h1 className="text-3xl font-semibold neon-text mt-1">UTI AMC Cyber Watch</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Continuous monitoring of cybersecurity-related public information about UTI Asset
            Management Company across CERT-In, SEBI, NSE and trusted cybersecurity publications.
            Permanent repository — refreshes append only.
          </p>
        </div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="inline-flex items-center gap-2 border border-primary/30 rounded-full px-4 py-2 text-sm text-primary hover:bg-primary/10"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${mut.isPending ? "animate-spin" : ""}`} />
          {mut.isPending ? "Refreshing…" : "Refresh now"}
        </button>
      </header>

      <section className="glass rounded-xl p-4 border border-white/5 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search headlines, sources…"
            className="h-9 pl-8 text-sm bg-white/5 border-white/10"
          />
        </div>
        <select
          value={incidentType}
          onChange={(e) => setIncidentType(e.target.value)}
          className="h-9 px-2 text-xs bg-white/5 border border-white/10 rounded"
        >
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-9 px-2 text-xs bg-white/5 border border-white/10 rounded max-w-[200px]"
        >
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 text-xs bg-white/5 border-white/10 w-[140px]"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {items.length}
        </span>
      </section>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading repository…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 glass rounded-xl border border-white/5">
          {items.length === 0
            ? "No records yet. Click Refresh to populate the repository."
            : "No matching items. Try clearing filters."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <UtiRow key={a.id} article={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UtiRow({ article }: { article: FeedArticle }) {
  const sev = article.severity ?? "info";
  return (
    <li className="glass rounded-xl p-4 border border-white/5 hover:border-primary/40 transition">
      <div className="flex items-start gap-3 flex-wrap">
        <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevColor[sev] ?? sevColor.info}`}>
              {sev}
            </span>
            {article.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-muted-foreground">
                {article.category}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {article.publisher ?? "News"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {article.published_at
                ? new Date(article.published_at).toLocaleDateString()
                : new Date(article.created_at).toLocaleDateString()}
            </span>
          </div>
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium hover:text-primary line-clamp-2"
          >
            {article.title}
          </a>
          {(article.ai_summary || article.snippet) && (
            <div className="mt-1.5 flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-3">
                {article.ai_summary ?? article.snippet}
              </p>
            </div>
          )}
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
        >
          Read full article <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </li>
  );
}
