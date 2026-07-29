import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArticles, refreshSource, type FeedArticle } from "@/lib/feeds.functions";
import { FileText, RefreshCw, ExternalLink, Download, Sparkles, Search as SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

const TABS = ["Circulars", "Guidelines", "Advisory", "Regulations"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/sebi")({
  component: SebiPage,
  head: () => ({
    meta: [
      { title: "SEBI Legal Repository — Circulars, Guidelines, Advisory, Regulations" },
      {
        name: "description",
        content:
          "Permanent, deduplicated repository of official SEBI legal documents: Circulars, Guidelines, Advisory and Regulations with AI summaries and PDF downloads.",
      },
      { property: "og:title", content: "SEBI Legal Repository" },
      {
        property: "og:description",
        content: "Official SEBI Circulars, Guidelines, Advisory and Regulations with AI summaries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function docType(a: FeedArticle): Tab {
  const c = (a.category ?? "").toLowerCase();
  if (c.startsWith("guideline")) return "Guidelines";
  if (c.startsWith("advisor")) return "Advisory";
  if (c.startsWith("regulation")) return "Regulations";
  if (c.startsWith("circular")) return "Circulars";
  // Legacy rows: fall back to the official SEBI URL path.
  const u = a.url.toLowerCase();
  if (u.includes("/legal/guidelines/")) return "Guidelines";
  if (u.includes("/legal/regulations/")) return "Regulations";
  if (/\badvisor(y|ies)\b/.test(a.title.toLowerCase())) return "Advisory";
  return "Circulars";
}

function SebiPage() {
  const get = useServerFn(listArticles);
  const refresh = useServerFn(refreshSource);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("Circulars");

  const query = useQuery({
    queryKey: ["sebi-articles"],
    queryFn: () => get({ data: { source_key: "sebi-whats-new", limit: 500 } }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: "sebi-whats-new" } }),
    onSuccess: (r) => {
      toast.success(`SEBI — ${r.results[0].added} new document${r.results[0].added === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["sebi-articles"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = query.data ?? [];
  const buckets = useMemo(() => {
    const b: Record<Tab, FeedArticle[]> = {
      Circulars: [],
      Guidelines: [],
      Advisory: [],
      Regulations: [],
    };
    for (const a of items) b[docType(a)].push(a);
    return b;
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = buckets[tab];
    if (!s) return list;
    return list.filter(
      (a) =>
        a.title.toLowerCase().includes(s) ||
        (a.snippet ?? "").toLowerCase().includes(s) ||
        (a.ai_summary ?? "").toLowerCase().includes(s),
    );
  }, [buckets, tab, q]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">SEBI</div>
          <h1 className="text-3xl font-semibold neon-text mt-1">Official SEBI Legal Repository</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Circulars, Guidelines, Advisory and Regulations sourced only from the official{" "}
            <a
              href="https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              SEBI legal listing
            </a>
            . Press releases, media news, speeches and third-party articles are excluded. Records are
            appended permanently — refreshing never clears history.
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

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm border transition ${
              tab === t
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}
          >
            {t}
            <span className="ml-1.5 text-[10px] opacity-70">{buckets[t].length}</span>
          </button>
        ))}
      </div>

      <section className="glass rounded-xl p-4 border border-white/5 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${tab.toLowerCase()}…`}
            className="h-9 pl-8 text-sm bg-white/5 border-white/10"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {buckets[tab].length} {tab.toLowerCase()}
        </span>
      </section>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading repository…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 glass rounded-xl border border-white/5">
          No {tab.toLowerCase()} stored yet. Click Refresh now to index the official SEBI listing.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <SebiRow key={a.id} article={a} type={tab} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SebiRow({ article, type }: { article: FeedArticle; type: Tab }) {
  const pdf =
    article.attachment_url ?? (article.url.toLowerCase().endsWith(".pdf") ? article.url : null);
  return (
    <li className="glass rounded-xl p-4 border border-white/5 hover:border-primary/40 transition">
      <div className="flex items-start gap-3 flex-wrap">
        <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary uppercase tracking-widest">
              {type}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {article.publisher ?? "SEBI"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {article.published_at
                ? new Date(article.published_at).toLocaleDateString(undefined, {
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
            View Official <ExternalLink className="h-3 w-3" />
          </a>
          {pdf && (
            <a
              href={pdf}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Download className="h-3 w-3" /> Download PDF
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
