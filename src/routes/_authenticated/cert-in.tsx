import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArticles, refreshSource, type FeedArticle } from "@/lib/feeds.functions";
import { ShieldAlert, RefreshCw, ExternalLink, Sparkles, Download, Search as SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/cert-in")({
  component: CertInPage,
});

const sevColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  info: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

function CertInPage() {
  const get = useServerFn(listArticles);
  const refresh = useServerFn(refreshSource);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("ALL");

  const query = useQuery({
    queryKey: ["cert-articles"],
    queryFn: () => get({ data: { source_key: "cert-in", limit: 500 } }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: "cert-in" } }),
    onSuccess: (r) => {
      toast.success(`CERT-In — ${r.results[0].added} new`);
      qc.invalidateQueries({ queryKey: ["cert-articles"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = query.data ?? [];
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter((a) => {
      if (sev !== "ALL" && a.severity !== sev.toLowerCase()) return false;
      if (!s) return true;
      return a.title.toLowerCase().includes(s) || (a.snippet ?? "").toLowerCase().includes(s);
    });
  }, [items, q, sev]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">CERT-In</div>
          <h1 className="text-3xl font-semibold neon-text mt-1">CERT-In Advisories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Permanent repository of every CERT-In advisory. Sourced from{" "}
            <a href="https://www.cert-in.org.in" target="_blank" rel="noreferrer" className="underline">
              cert-in.org.in
            </a>
            . Auto-refreshes every 5 minutes.
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

      <section className="glass rounded-xl p-4 border border-border flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search advisories…"
            className="h-9 pl-8 text-sm bg-muted/50 border-border"
          />
        </div>
        <div className="flex gap-1">
          {["ALL", "critical", "high", "medium", "info"].map((s) => (
            <button
              key={s}
              onClick={() => setSev(s)}
              className={`text-[11px] px-2 py-1 rounded border ${
                sev === s
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {items.length} advisories
        </span>
      </section>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading repository…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 glass rounded-xl border border-border">
          No matching advisories. Try clearing filters or Refresh.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <CertRow key={a.id} article={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CertRow({ article }: { article: FeedArticle }) {
  const sev = article.severity ?? "info";
  return (
    <li className="glass rounded-xl p-4 border border-border hover:border-red-500/40 transition">
      <div className="flex items-start gap-3 flex-wrap">
        <ShieldAlert className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevColor[sev] ?? sevColor.info}`}>
              {sev}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {article.publisher ?? "CERT-In"}
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
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
          {article.attachment_url && (
            <a
              href={article.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Download className="h-3 w-3" /> Download
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
