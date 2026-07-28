import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArticles, refreshSource, type FeedArticle } from "@/lib/feeds.functions";
import { FileText, RefreshCw, ExternalLink, Download, Sparkles, Search as SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/sebi")({
  component: SebiPage,
});

function SebiPage() {
  const get = useServerFn(listArticles);
  const refresh = useServerFn(refreshSource);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");

  const query = useQuery({
    queryKey: ["sebi-articles"],
    queryFn: () => get({ data: { source_key: "sebi-whats-new", limit: 500 } }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: "sebi-whats-new" } }),
    onSuccess: (r) => {
      toast.success(`SEBI — ${r.results[0].added} new item${r.results[0].added === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["sebi-articles"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = query.data ?? [];
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[],
    [items],
  );
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter((a) => {
      if (category !== "ALL" && a.category !== category) return false;
      if (!s) return true;
      return a.title.toLowerCase().includes(s) || (a.snippet ?? "").toLowerCase().includes(s);
    });
  }, [items, q, category]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">SEBI</div>
          <h1 className="text-3xl font-semibold neon-text mt-1">SEBI Circular Repository</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Permanent repository of official SEBI Circulars only. Sourced directly from{" "}
            <a href="https://www.sebi.gov.in/" target="_blank" rel="noreferrer" className="underline">
              sebi.gov.in
            </a>
            . Press releases, orders, speeches and news are excluded. Auto-refreshes hourly; new
            circulars are appended and never removed.
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
            placeholder="Search title or content…"
            className="h-9 pl-8 text-sm bg-white/5 border-white/10"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md bg-white/5 border border-white/10 px-2 text-sm"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {items.length} items
        </span>
      </section>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading repository…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 glass rounded-xl border border-white/5">
          No matching items. Try clearing filters or clicking Refresh.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <SebiRow key={a.id} article={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SebiRow({ article }: { article: FeedArticle }) {
  const isPdf = article.attachment_url || article.url.endsWith(".pdf");
  return (
    <li className="glass rounded-xl p-4 border border-white/5 hover:border-primary/40 transition">
      <div className="flex items-start gap-3 flex-wrap">
        <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {article.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary uppercase tracking-widest">
                {article.category}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {article.publisher ?? "SEBI"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {article.published_at
                ? new Date(article.published_at).toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
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
              <p className="text-xs text-muted-foreground line-clamp-2">
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
          {isPdf && (
            <a
              href={article.attachment_url ?? article.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Download className="h-3 w-3" /> PDF
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
