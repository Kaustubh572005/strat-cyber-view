import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listOrders,
  listPublicIssues,
  listSebiRepoStatus,
  refreshSebiIntel,
  searchSebiAll,
  type OrderRow,
  type PublicIssueRow,
} from "@/lib/sebi-intel.functions";
import { listArticles, refreshSource, type FeedArticle } from "@/lib/feeds.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  BookOpen,
  Building2,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/sebi")({
  head: () => ({
    meta: [
      { title: "SEBI — Legal, Public Issues & Orders | Kaalu AI" },
      {
        name: "description",
        content:
          "Unified official SEBI repository: Legal (Circulars, Guidelines, Advisory, Regulations), Public Issues filings and Orders with AI summaries and global search.",
      },
      { property: "og:title", content: "SEBI — Legal, Public Issues & Orders" },
      {
        property: "og:description",
        content: "One searchable SEBI portal covering Legal documents, Public Issues filings and Orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SebiPage,
});

const LEGAL_TABS = ["Circulars", "Guidelines", "Advisory", "Regulations"] as const;
type LegalTab = (typeof LEGAL_TABS)[number];

const PI_TYPES = [
  "Draft Offer Documents",
  "Red Herring Documents",
  "Final Offer Documents",
  "Other Documents",
] as const;

const ORDER_CATS = [
  "Orders of SAT",
  "Orders of Chairperson / Members",
  "Settlement Orders",
  "Orders under RTI Act",
  "Orders of Corporatisation / Demutualisation Scheme",
  "Orders of AO",
  "Orders of Courts",
  "Orders of Special Courts",
  "Orders of ED / CGM",
  "Orders under Regulation 30A",
] as const;

type View =
  | { kind: "search" }
  | { kind: "legal"; tab: LegalTab }
  | { kind: "public-issues"; type: (typeof PI_TYPES)[number] }
  | { kind: "orders"; category: (typeof ORDER_CATS)[number] };

function legalType(a: FeedArticle): LegalTab {
  const c = (a.category ?? "").toLowerCase();
  if (c.startsWith("guideline")) return "Guidelines";
  if (c.startsWith("advisor")) return "Advisory";
  if (c.startsWith("regulation")) return "Regulations";
  if (c.startsWith("circular")) return "Circulars";
  const u = a.url.toLowerCase();
  if (u.includes("/legal/guidelines/")) return "Guidelines";
  if (u.includes("/legal/regulations/")) return "Regulations";
  if (/\badvisor(y|ies)\b/.test(a.title.toLowerCase())) return "Advisory";
  return "Circulars";
}

function SebiPage() {
  const [view, setView] = useState<View>({ kind: "legal", tab: "Circulars" });
  const [search, setSearch] = useState("");
  const [year, setYear] = useState<string>("");

  const getLegal = useServerFn(listArticles);
  const getPi = useServerFn(listPublicIssues);
  const getOrders = useServerFn(listOrders);
  const getStatus = useServerFn(listSebiRepoStatus);
  const doSearch = useServerFn(searchSebiAll);

  const statusQ = useQuery({ queryKey: ["sebi-repo-status"], queryFn: () => getStatus(), staleTime: 60_000 });
  const yearNum = year ? Number(year) : undefined;

  const legalQ = useQuery({
    queryKey: ["sebi-articles"],
    queryFn: () => getLegal({ data: { source_key: "sebi-whats-new", limit: 500 } }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });

  const piQ = useQuery({
    queryKey: ["sebi-public-issues", view, search, year],
    enabled: view.kind === "public-issues",
    queryFn: () =>
      getPi({
        data: {
          doc_type: view.kind === "public-issues" ? view.type : undefined,
          search: search || undefined,
          year: yearNum,
          limit: 300,
        },
      }),
    staleTime: 30_000,
  });

  const ordQ = useQuery({
    queryKey: ["sebi-orders", view, search, year],
    enabled: view.kind === "orders",
    queryFn: () =>
      getOrders({
        data: {
          category: view.kind === "orders" ? view.category : undefined,
          search: search || undefined,
          year: yearNum,
          limit: 300,
        },
      }),
    staleTime: 30_000,
  });

  const searchQ = useQuery({
    queryKey: ["sebi-global-search", search, year],
    enabled: view.kind === "search" && search.trim().length >= 2,
    queryFn: () => doSearch({ data: { q: search.trim(), repo: "all", year: yearNum, limit: 120 } }),
    staleTime: 30_000,
  });

  const legalBuckets = useMemo(() => {
    const b: Record<LegalTab, FeedArticle[]> = {
      Circulars: [],
      Guidelines: [],
      Advisory: [],
      Regulations: [],
    };
    for (const a of legalQ.data ?? []) b[legalType(a)].push(a);
    return b;
  }, [legalQ.data]);

  const legalRows = useMemo(() => {
    if (view.kind !== "legal") return [];
    const s = search.trim().toLowerCase();
    return legalBuckets[view.tab].filter((a) => {
      if (yearNum) {
        const d = a.published_at ?? a.created_at;
        if (new Date(d).getUTCFullYear() !== yearNum) return false;
      }
      if (!s) return true;
      return (
        a.title.toLowerCase().includes(s) ||
        (a.snippet ?? "").toLowerCase().includes(s) ||
        (a.ai_summary ?? "").toLowerCase().includes(s)
      );
    });
  }, [legalBuckets, view, search, yearNum]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 26 }, (_, i) => now - i);
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto">
      <header className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Official SEBI Repositories
        </div>
        <h1 className="text-3xl font-semibold mt-1">SEBI</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          One portal for three official repositories — Legal, Public Issues and Orders. Everything is
          indexed from sebi.gov.in only, stored permanently, and appended on every refresh.
        </p>
      </header>

      {/* Compact horizontal navigation for narrow screens */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8 xl:hidden">
        <ScrollTabs
          items={[
            { key: "search", label: "Global Search" },
            { key: "legal", label: "Legal" },
            { key: "public-issues", label: "Public Issues" },
            { key: "orders", label: "Orders" },
          ]}
          activeKey={view.kind}
          onSelect={(k) => {
            if (k === "search") setView({ kind: "search" });
            else if (k === "legal") setView({ kind: "legal", tab: LEGAL_TABS[0] });
            else if (k === "public-issues") setView({ kind: "public-issues", type: PI_TYPES[0] });
            else setView({ kind: "orders", category: ORDER_CATS[0] });
          }}
        />
        {view.kind === "legal" && (
          <ScrollTabs
            size="sm"
            items={LEGAL_TABS.map((t) => ({ key: t, label: t, count: legalBuckets[t].length }))}
            activeKey={view.tab}
            onSelect={(k) => setView({ kind: "legal", tab: k as LegalTab })}
          />
        )}
        {view.kind === "public-issues" && (
          <ScrollTabs
            size="sm"
            items={PI_TYPES.map((t) => ({ key: t, label: t }))}
            activeKey={view.type}
            onSelect={(k) => setView({ kind: "public-issues", type: k as (typeof PI_TYPES)[number] })}
          />
        )}
        {view.kind === "orders" && (
          <ScrollTabs
            size="sm"
            items={ORDER_CATS.map((c) => ({ key: c, label: c.replace(/^Orders (of|under) /, "") }))}
            activeKey={view.category}
            onSelect={(k) => setView({ kind: "orders", category: k as (typeof ORDER_CATS)[number] })}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_1fr]">
        <nav className="glass hidden h-fit space-y-3 rounded-2xl border border-border p-3 xl:sticky xl:top-20 xl:block">

          <button
            onClick={() => setView({ kind: "search" })}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
              view.kind === "search" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}
          >
            <Search className="h-4 w-4" /> Global Search
          </button>

          <NavGroup icon={<BookOpen className="h-3.5 w-3.5" />} label="Legal">
            {LEGAL_TABS.map((t) => (
              <NavRow
                key={t}
                label={t}
                count={legalBuckets[t].length}
                active={view.kind === "legal" && view.tab === t}
                onClick={() => setView({ kind: "legal", tab: t })}
              />
            ))}
          </NavGroup>

          <NavGroup icon={<FileText className="h-3.5 w-3.5" />} label="Public Issues">
            {PI_TYPES.map((t) => (
              <NavRow
                key={t}
                label={t}
                active={view.kind === "public-issues" && view.type === t}
                onClick={() => setView({ kind: "public-issues", type: t })}
              />
            ))}
          </NavGroup>

          <NavGroup icon={<Scale className="h-3.5 w-3.5" />} label="Orders">
            {ORDER_CATS.map((c) => (
              <NavRow
                key={c}
                label={c.replace(/^Orders (of|under) /, "")}
                active={view.kind === "orders" && view.category === c}
                onClick={() => setView({ kind: "orders", category: c })}
              />
            ))}
          </NavGroup>

          <div className="border-t border-border pt-3 space-y-2">
            <RefreshButtons />
            {(statusQ.data ?? []).map((s) => (
              <div key={s.repo_key} className="px-3 text-[10px] text-muted-foreground flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    s.last_status === "ok"
                      ? "bg-emerald-500"
                      : s.last_status === "error"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                  }`}
                />
                {s.display_name}:{" "}
                {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : "not synced yet"}
              </div>
            ))}
          </div>
        </nav>

        <section className="space-y-4 min-w-0">
          <div className="glass rounded-2xl border border-border p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  view.kind === "search"
                    ? "Search Legal, Public Issues and Orders…"
                    : "Search company, title or keyword…"
                }
                className="pl-9"
              />
            </div>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {(search || year) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setYear("");
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {view.kind === "search" ? (
            <div className="space-y-3">
              <SectionHeader
                title="Global Search"
                subtitle="One search across the Legal, Public Issues and Orders repositories"
                count={searchQ.data?.length}
              />
              {search.trim().length < 2 ? (
                <Empty text="Type at least two characters to search all three repositories." />
              ) : searchQ.isLoading ? (
                <Skeletons />
              ) : (searchQ.data ?? []).length === 0 ? (
                <Empty text="No matching records." />
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {(searchQ.data ?? []).map((h) => (
                    <DocCard
                      key={`${h.repo}-${h.id}`}
                      tag={h.repo}
                      subtag={h.bucket}
                      entity={h.entity}
                      title={h.title}
                      date={h.date}
                      summary={h.ai_summary}
                      url={h.url}
                      pdf={h.pdf_url}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : view.kind === "legal" ? (
            <RepoList
              title={`Legal — ${view.tab}`}
              subtitle="Official SEBI legal listing — append-only permanent history"
              loading={legalQ.isLoading}
              rows={legalRows.map((a) => ({
                id: a.id,
                tag: "Legal",
                subtag: view.kind === "legal" ? view.tab : "Legal",
                entity: null,
                title: a.title,
                date: a.published_at,
                summary: a.ai_summary ?? a.snippet,
                url: a.url,
                pdf: a.attachment_url ?? (a.url.toLowerCase().endsWith(".pdf") ? a.url : null),
                created_at: a.created_at,
              }))}
            />
          ) : view.kind === "public-issues" ? (
            <RepoList
              title={view.type}
              subtitle="Official SEBI Public Issues repository — append-only permanent history"
              loading={piQ.isLoading}
              rows={(piQ.data ?? []).map((r: PublicIssueRow) => ({
                id: r.id,
                tag: "Public Issues",
                subtag: r.doc_type,
                entity: r.company_name,
                title: r.title,
                date: r.filing_date,
                summary: r.ai_summary,
                url: r.url,
                pdf: r.pdf_url,
                created_at: r.created_at,
              }))}
            />
          ) : (
            <RepoList
              title={view.category}
              subtitle="Official SEBI Orders repository — append-only permanent history"
              loading={ordQ.isLoading}
              rows={(ordQ.data ?? []).map((r: OrderRow) => ({
                id: r.id,
                tag: "Orders",
                subtag: r.category,
                entity: r.entity_name,
                title: r.title,
                date: r.order_date,
                summary: r.ai_summary,
                url: r.url,
                pdf: r.pdf_url,
                created_at: r.created_at,
              }))}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function NavGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavRow({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] leading-snug transition flex items-center justify-between gap-2 ${
        active
          ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && <span className="text-[10px] opacity-70">{count}</span>}
    </button>
  );
}

function RefreshButtons() {
  const qc = useQueryClient();
  const refreshIntel = useServerFn(refreshSebiIntel);
  const refreshLegal = useServerFn(refreshSource);
  const mut = useMutation({
    mutationFn: async (vars: { full: boolean }) => {
      const legal = await refreshLegal({ data: { source_key: "sebi-whats-new" } });
      const intel = await refreshIntel({ data: { repo: "all", full: vars.full } });
      return {
        added: (legal.results[0]?.added ?? 0) + intel.results.reduce((s, r) => s + r.added, 0),
        error: intel.results.find((r) => r.error)?.error,
      };
    },
    onSuccess: (res) => {
      if (res.error) toast.error(res.error);
      else toast.success(`Sync complete — ${res.added} new record${res.added === 1 ? "" : "s"}`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message || "Sync failed"),
  });
  return (
    <div className="px-2 space-y-1.5">
      <Button
        size="sm"
        variant="secondary"
        className="w-full gap-2"
        disabled={mut.isPending}
        onClick={() => mut.mutate({ full: false })}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${mut.isPending ? "animate-spin" : ""}`} />
        {mut.isPending ? "Syncing…" : "Refresh repositories"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-xs"
        disabled={mut.isPending}
        onClick={() => mut.mutate({ full: true })}
      >
        Full historical backfill
      </Button>
    </div>
  );
}

type Row = {
  id: string;
  tag: string;
  subtag: string;
  entity: string | null;
  title: string;
  date: string | null;
  summary: string | null;
  url: string;
  pdf: string | null;
  created_at: string;
};

function RepoList({
  title,
  subtitle,
  loading,
  rows,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  rows: Row[];
}) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (
    <div className="space-y-3">
      <SectionHeader title={title} subtitle={subtitle} count={rows.length} />
      {loading && rows.length === 0 ? (
        <Skeletons />
      ) : rows.length === 0 ? (
        <Empty text="No records stored yet. Use “Refresh repositories” to index the official SEBI listing." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {rows.map((r) => (
            <DocCard
              key={r.id}
              tag={r.tag}
              subtag={r.subtag}
              entity={r.entity}
              title={r.title}
              date={r.date}
              summary={r.summary}
              url={r.url}
              pdf={r.pdf}
              isNew={new Date(r.created_at).getTime() > cutoff}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count?: number;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {typeof count === "number" && (
        <span className="text-[11px] text-muted-foreground">
          {count} record{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-32 bg-muted/50 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-sm text-muted-foreground py-10 text-center glass rounded-2xl border border-border">
      {text}
    </div>
  );
}

function DocCard({
  tag,
  subtag,
  entity,
  title,
  date,
  summary,
  url,
  pdf,
  isNew,
}: {
  tag: string;
  subtag: string;
  entity: string | null;
  title: string;
  date: string | null;
  summary: string | null;
  url: string;
  pdf: string | null;
  isNew?: boolean;
}) {
  return (
    <article className="glass rounded-xl p-4 border border-border hover:border-primary/40 transition flex flex-col">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 uppercase tracking-widest">
          {tag}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground uppercase tracking-widest">
          {subtag}
        </span>
        {isNew && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 uppercase tracking-widest font-semibold">
            New
          </span>
        )}
      </div>
      {entity && (
        <div className="text-xs font-medium text-foreground/80 flex items-center gap-1.5 mb-1">
          <Building2 className="h-3 w-3 text-muted-foreground" /> {entity}
        </div>
      )}
      <h3 className="text-sm font-medium leading-snug">{title}</h3>
      {summary && (
        <div className="mt-2 flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {date
            ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
            : "—"}
        </span>
        <span className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            View Official <ExternalLink className="h-3 w-3" />
          </a>
          {pdf && (
            <a
              href={pdf}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              Download <Download className="h-3 w-3" />
            </a>
          )}
        </span>
      </div>
    </article>
  );
}
