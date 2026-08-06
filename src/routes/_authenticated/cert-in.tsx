import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArticles, refreshSource, type FeedArticle } from "@/lib/feeds.functions";
import { ShieldAlert, RefreshCw, ExternalLink, Sparkles, Search as SearchIcon, Bug } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/cert-in")({
  component: CertInPage,
  head: () => ({
    meta: [
      { title: "CERT-In 2026 — Advisories & Vulnerability Notes | Kaalu AI" },
      {
        name: "description",
        content:
          "Permanent repository of official CERT-In 2026 Advisories and Vulnerability Notes with executive AI summaries, newest first.",
      },
      { property: "og:title", content: "CERT-In 2026 Advisories & Vulnerability Notes" },
      {
        property: "og:description",
        content: "Official CERT-In 2026 advisories and vulnerability notes with AI executive summaries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const sevColor: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  low: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  info: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

const TABS = [
  {
    key: "advisories" as const,
    label: "Advisories (2026)",
    source: "cert-in" as const,
    official: "https://www.cert-in.org.in/s2cMainServlet?pageid=PUBADVLIST02&year=2026",
    linkLabel: "View Official Advisory",
    noun: "advisory",
  },
  {
    key: "notes" as const,
    label: "Vulnerability Notes (2026)",
    source: "cert-in-vuln" as const,
    official: "https://www.cert-in.org.in/s2cMainServlet?pageid=VLNLIST02&year=2026",
    linkLabel: "View Official Note",
    noun: "vulnerability note",
  },
];

function CertInPage() {
  const get = useServerFn(listArticles);
  const refresh = useServerFn(refreshSource);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("ALL");
  const [tabKey, setTabKey] = useState<"advisories" | "notes">("advisories");
  const tab = TABS.find((t) => t.key === tabKey)!;

  const query = useQuery({
    queryKey: ["cert-articles", tab.source],
    queryFn: () => get({ data: { source_key: tab.source, limit: 500 } }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: tab.source } }),
    onSuccess: (r) => {
      toast.success(`${tab.label} — ${r.results[0].added} new`);
      qc.invalidateQueries({ queryKey: ["cert-articles"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // 2026 records only, newest → oldest.
  const items = useMemo(() => {
    const rows = (query.data ?? []).filter((a) => {
      if (/-(20\d\d)-/.test(a.external_id)) return a.external_id.includes("-2026-");
      return a.published_at ? new Date(a.published_at).getUTCFullYear() === 2026 : true;
    });
    return rows.sort((a, b) => {
      const d = (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);
      return d !== 0 ? d : b.external_id.localeCompare(a.external_id);
    });
  }, [query.data]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter((a) => {
      if (sev !== "ALL" && a.severity !== sev.toLowerCase()) return false;
      if (!s) return true;
      return (
        a.title.toLowerCase().includes(s) ||
        a.external_id.toLowerCase().includes(s) ||
        (a.ai_summary ?? "").toLowerCase().includes(s)
      );
    });
  }, [items, q, sev]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">CERT-In</div>
          <h1 className="text-3xl font-semibold mt-1">CERT-In 2026 Repository</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Official 2026 Advisories and Vulnerability Notes sourced only from{" "}
            <a href={tab.official} target="_blank" rel="noreferrer" className="underline">
              cert-in.org.in
            </a>
            . Records are appended permanently and never cleared — newest first.
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
            key={t.key}
            onClick={() => setTabKey(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm border transition inline-flex items-center gap-2 ${
              tabKey === t.key
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.key === "advisories" ? <ShieldAlert className="h-3.5 w-3.5" /> : <Bug className="h-3.5 w-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      <section className="glass rounded-xl p-4 border border-border flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${tab.noun}s…`}
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
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {items.length} {tab.noun}s (2026)
        </span>
      </section>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading repository…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 glass rounded-xl border border-border">
          No 2026 {tab.noun}s stored yet. Click Refresh now to index the official CERT-In listing.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <CertRow key={a.id} article={a} linkLabel={tab.linkLabel} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CertRow({ article, linkLabel }: { article: FeedArticle; linkLabel: string }) {
  const sev = article.severity ?? "info";
  const summary = article.ai_summary;
  return (
    <li className="glass rounded-xl p-4 border border-border hover:border-primary/40 transition">
      <div className="flex items-start gap-3 flex-wrap">
        <ShieldAlert className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary font-medium tracking-wide">
              {article.external_id}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevColor[sev] ?? sevColor.info}`}>
              {sev}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {article.category ?? "Advisory"}
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
          <div className="mt-1.5 flex items-start gap-1.5">
            <Sparkles className="h-3 w-3 text-accent shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {summary ?? "AI summary is being generated — refresh in a moment."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {linkLabel} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </li>
  );
}
