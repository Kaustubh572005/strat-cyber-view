import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listArticles,
  listNseDisclosures,
  listSourceStatus,
  refreshSource,
  type FeedArticle,
  type NseDisclosureRow,
  type SourceStatus,
} from "@/lib/feeds.functions";
import { listNotifications } from "@/lib/notifications.functions";
import {
  ShieldAlert,
  FileText,
  Building2,
  Newspaper,
  Cpu,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Bell,
  ExternalLink,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const POLL_MS = 5 * 60 * 1000;

function DashboardPage() {
  const getArticles = useServerFn(listArticles);
  const getNse = useServerFn(listNseDisclosures);
  const getStatus = useServerFn(listSourceStatus);
  const getNotifs = useServerFn(listNotifications);

  const feedQ = useQuery({
    queryKey: ["dashboard-articles"],
    queryFn: () =>
      getArticles({
        data: {
          source_keys: ["sebi-whats-new", "cert-in", "cyber-news", "ai-news", "uti-amc-cyber"],
          limit: 500,
        },
      }),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
  const nseQ = useQuery({
    queryKey: ["dashboard-nse"],
    queryFn: () => getNse({ data: { limit: 30 } }),
    refetchInterval: POLL_MS,
    staleTime: 60_000,
  });
  const statusQ = useQuery({
    queryKey: ["source-status"],
    queryFn: () => getStatus(),
    refetchInterval: POLL_MS,
    staleTime: 30_000,
  });
  const notifQ = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifs({ data: { limit: 20 } }),
    refetchInterval: POLL_MS,
    staleTime: 30_000,
  });

  const articles = feedQ.data ?? [];
  const byKey = (k: string) => articles.filter((a) => a.source_key === k);
  const cyberNews = byKey("cyber-news");
  const aiNews = byKey("ai-news");
  const sebi = byKey("sebi-whats-new");
  const certIn = byKey("cert-in");
  const uti = byKey("uti-amc-cyber");
  const nse = nseQ.data ?? [];
  const notifs = (notifQ.data ?? []).filter((n) => !n.dismissed);

  // Track newness
  const seenRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [firstLoad, setFirstLoad] = useState(true);

  const allIds = useMemo(() => {
    const ids: string[] = [];
    articles.forEach((a) => ids.push(a.id));
    nse.forEach((r) => ids.push(r.id));
    return ids;
  }, [articles, nse]);

  useEffect(() => {
    if (allIds.length === 0) return;
    if (seenRef.current === null) {
      seenRef.current = new Set(allIds);
      setFirstLoad(false);
      return;
    }
    const seen = seenRef.current;
    const fresh = allIds.filter((id) => !seen.has(id));
    if (fresh.length > 0) {
      fresh.forEach((id) => seen.add(id));
      setNewIds((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.add(id));
        return next;
      });
      toast.success(`${fresh.length} new intelligence update${fresh.length === 1 ? "" : "s"}`);
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          fresh.forEach((id) => next.delete(id));
          return next;
        });
      }, 15 * 60 * 1000);
    }
  }, [allIds]);

  const isNew = (id: string) => !firstLoad && newIds.has(id);
  const today = new Date().toDateString();
  const isToday = (iso: string | null) => (iso ? new Date(iso).toDateString() === today : false);

  const critical = articles.filter((a) => a.severity === "critical").length;
  const cyberToday = cyberNews.filter((a) => isToday(a.published_at)).length;
  const sebiToday = sebi.filter((a) => isToday(a.published_at)).length;
  const certToday = certIn.filter((a) => isToday(a.published_at)).length;
  const nseToday = nse.filter((r) => isToday(r.notice_datetime)).length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cyber Command Center</div>
          <h1 className="text-3xl font-semibold neon-text mt-1">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Live aggregation from SEBI, CERT-In, NSE cybersecurity notices, and global cyber &amp; AI news.
            Data is synced hourly to a permanent repository. Page auto-refreshes every 5 minutes.
          </p>
        </div>
        <RefreshAllButton />
      </header>

      {/* AI Daily Brief */}
      <section className="glass rounded-2xl p-5 border border-primary/20 bg-primary/[0.03]">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary mb-2">
          <Sparkles className="h-3.5 w-3.5" /> Kaalu's Daily Brief
        </div>
        <p className="text-sm leading-relaxed">
          Good day, Sir. Today there are{" "}
          <b className="text-foreground">{sebiToday}</b> new SEBI item{sebiToday === 1 ? "" : "s"},{" "}
          <b className="text-foreground">{certToday}</b> new CERT-In advisor{certToday === 1 ? "y" : "ies"},{" "}
          <b className="text-foreground">{nseToday}</b> new NSE cybersecurity notice{nseToday === 1 ? "" : "s"}, and{" "}
          <b className="text-foreground">{cyberToday}</b> new cybersecurity news article{cyberToday === 1 ? "" : "s"}.
          {critical > 0 ? (
            <>
              {" "}
              The feed contains{" "}
              <b className="text-red-400">{critical} critical-severity</b> item{critical === 1 ? "" : "s"} —
              please review the Cyber Intelligence page.
            </>
          ) : (
            <> No critical items at this time.</>
          )}
        </p>
      </section>

      {/* KPI grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi icon={FileText} label="SEBI today" value={sebiToday} total={sebi.length} to="/sebi" />
        <Kpi icon={ShieldAlert} label="CERT-In today" value={certToday} total={certIn.length} to="/cert-in" />
        <Kpi icon={Building2} label="NSE cyber today" value={nseToday} total={nse.length} to="/nse" />
        <Kpi icon={Newspaper} label="Cyber news today" value={cyberToday} total={cyberNews.length} to="/cyber" />
        <Kpi icon={Cpu} label="AI updates today" value={aiNews.filter((a) => isToday(a.published_at)).length} total={aiNews.length} to="/cyber" />
      </section>

      {/* Source health */}
      <SourceHealthStrip status={statusQ.data ?? []} />

      {/* Feed sections */}
      <FeedSection
        icon={Newspaper}
        title="Cybersecurity News"
        subtitle="Latest global cyber threat headlines"
        viewAllTo="/cyber"
        sourceKey="cyber-news"
        items={cyberNews.slice(0, 8)}
        loading={feedQ.isLoading}
        isNew={isNew}
        renderer={(a) => <ArticleCard article={a} isNew={isNew(a.id)} tone="primary" />}
      />

      <FeedSection
        icon={FileText}
        title="SEBI Legal Updates"
        subtitle="Circulars, Guidelines, Advisory & Regulations from the official SEBI legal repository"
        viewAllTo="/sebi"
        viewAllLabel="View All SEBI Legal Updates"
        sourceKey="sebi-whats-new"
        items={sebi.slice(0, 5)}
        loading={feedQ.isLoading}
        isNew={isNew}
        renderer={(a) => <ArticleCard article={a} isNew={isNew(a.id)} tone="primary" showCategory />}
      />

      <FeedSection
        icon={ShieldAlert}
        title="CERT-In Advisories"
        subtitle="Indian Computer Emergency Response Team advisories"
        viewAllTo="/cert-in"
        sourceKey="cert-in"
        items={certIn.slice(0, 8)}
        loading={feedQ.isLoading}
        isNew={isNew}
        renderer={(a) => <ArticleCard article={a} isNew={isNew(a.id)} tone="red" showSeverity />}
      />

      <NseSection items={nse.slice(0, 8)} loading={nseQ.isLoading} isNew={isNew} />

      <FeedSection
        icon={ShieldAlert}
        title="UTI AMC Cyber Watch"
        subtitle="Cybersecurity intelligence mentioning UTI Asset Management Company"
        viewAllTo="/uti-amc"
        sourceKey="uti-amc-cyber"
        items={uti.slice(0, 8)}
        loading={feedQ.isLoading}
        isNew={isNew}
        renderer={(a) => <ArticleCard article={a} isNew={isNew(a.id)} tone="primary" showSeverity showCategory />}
      />


      <FeedSection
        icon={Cpu}
        title="AI & Emerging Technology"
        subtitle="AI advances and their security implications"
        viewAllTo="/cyber"
        sourceKey="ai-news"
        items={aiNews.slice(0, 8)}
        loading={feedQ.isLoading}
        isNew={isNew}
        renderer={(a) => <ArticleCard article={a} isNew={isNew(a.id)} tone="cyan" />}
      />

      {/* Notification Center preview */}
      <section className="glass rounded-2xl p-5 border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Notification Center</h2>
            {notifs.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40">
                {notifs.length} unread
              </span>
            )}
          </div>
          <Link
            to="/notifications"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/10 transition"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {notifs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unread notifications.</p>
        ) : (
          <ul className="space-y-1.5">
            {notifs.slice(0, 5).map((n) => (
              <li key={n.id} className="text-sm flex items-start gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0 mt-1">
                  {n.source_key}
                </span>
                <span className="line-clamp-1">{n.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  total,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  total: number;
  to: string;
}) {
  return (
    <Link
      to={to as any}
      className="group glass rounded-xl p-3.5 border border-white/5 hover:border-primary/40 transition block"
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">of {total} in repository</div>
    </Link>
  );
}

function RefreshAllButton() {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshSource);
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: "all" } }),
    onSuccess: (res) => {
      const total = res.results.reduce((s, r) => s + r.added, 0);
      toast.success(`Sync complete — ${total} new item${total === 1 ? "" : "s"}`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message || "Sync failed"),
  });
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      className="gap-2"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${mut.isPending ? "animate-spin" : ""}`} />
      {mut.isPending ? "Syncing…" : "Refresh all"}
    </Button>
  );
}

function SourceHealthStrip({ status }: { status: SourceStatus[] }) {
  if (status.length === 0) return null;
  return (
    <section className="glass rounded-xl p-3 border border-white/5 flex flex-wrap gap-3 text-xs">
      {status.map((s) => (
        <div key={s.source_key} className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              s.last_status === "ok"
                ? "bg-emerald-400"
                : s.last_status === "error"
                  ? "bg-red-400"
                  : "bg-yellow-400"
            }`}
          />
          <span className="text-muted-foreground">{s.display_name}</span>
          <span className="text-[10px] text-muted-foreground">
            {s.last_synced_at ? new Date(s.last_synced_at).toLocaleTimeString() : "not yet"}
          </span>
        </div>
      ))}
    </section>
  );
}

function FeedSection({
  icon: Icon,
  title,
  subtitle,
  viewAllTo,
  viewAllLabel,
  sourceKey,
  items,
  loading,
  renderer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  viewAllTo: string;
  viewAllLabel?: string;
  sourceKey: string;
  items: FeedArticle[];
  loading: boolean;
  isNew: (id: string) => boolean;
  renderer: (a: FeedArticle) => React.ReactNode;
}) {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshSource);
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: sourceKey as any } }),
    onSuccess: (res) => {
      const r = res.results[0];
      toast.success(`${title} — ${r.added} new`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message || "Sync failed"),
  });
  return (
    <section className="glass rounded-2xl p-5 border border-white/5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/5 transition"
          >
            <RefreshCw className={`h-3 w-3 ${mut.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            to={viewAllTo as any}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/10 transition"
          >
            {viewAllLabel ?? "View all"} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No items yet. Click Refresh to fetch the latest.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(renderer)}
        </div>
      )}
    </section>
  );
}

function NseSection({
  items,
  loading,
  isNew,
}: {
  items: NseDisclosureRow[];
  loading: boolean;
  isNew: (id: string) => boolean;
}) {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshSource);
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: "nse-cyber" } }),
    onSuccess: (res) => {
      const r = res.results[0];
      toast.success(`NSE Cybersecurity — ${r.added} new`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message || "Sync failed"),
  });
  return (
    <section className="glass rounded-2xl p-5 border border-white/5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">NSE Cybersecurity Notices</h2>
            <p className="text-xs text-muted-foreground">
              Cybersecurity / information security disclosures filed on the NSE
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/5 transition"
          >
            <RefreshCw className={`h-3 w-3 ${mut.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            to="/nse"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/10 transition"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No NSE cybersecurity notices yet. Click Refresh.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((r) => (
            <NseCard key={r.id} row={r} isNew={isNew(r.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

const sevColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  info: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

function NewBadge() {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 uppercase tracking-widest font-semibold animate-pulse">
      New
    </span>
  );
}

function ArticleCard({
  article,
  isNew,
  showSeverity,
  showCategory,
}: {
  article: FeedArticle;
  isNew?: boolean;
  tone?: string;
  showSeverity?: boolean;
  showCategory?: boolean;
}) {
  const sev = article.severity ?? "info";
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className="glass rounded-xl p-4 border border-white/5 hover:border-primary/40 transition block group"
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {showSeverity && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevColor[sev] ?? sevColor.info}`}>{sev}</span>}
        {showCategory && article.category && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 uppercase tracking-widest text-muted-foreground">
            {article.category}
          </span>
        )}
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {article.publisher ?? article.source_key}
        </span>
        {isNew && <NewBadge />}
      </div>
      <div className="font-medium text-sm leading-snug group-hover:text-primary transition line-clamp-2">
        {article.title}
      </div>
      {article.snippet && (
        <div className="mt-2 flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground line-clamp-3">
            {article.ai_summary ?? article.snippet}
          </p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {article.published_at
            ? new Date(article.published_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : new Date(article.created_at).toLocaleDateString()}
        </span>
        <span className="inline-flex items-center gap-1 group-hover:text-primary transition">
          Open <ExternalLink className="h-3 w-3" />
        </span>
      </div>
    </a>
  );
}

function NseCard({ row, isNew }: { row: NseDisclosureRow; isNew?: boolean }) {
  return (
    <div className="glass rounded-xl p-4 border border-white/5 hover:border-primary/40 transition">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {row.incident_type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/30 uppercase tracking-widest">
            {row.incident_type}
          </span>
        )}
        {row.symbol && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 uppercase tracking-widest text-muted-foreground">
            {row.symbol}
          </span>
        )}
        {isNew && <NewBadge />}
      </div>
      <div className="font-medium text-sm leading-snug line-clamp-2">
        {row.company_name ?? "NSE Filing"}
      </div>
      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{row.subject}</div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {row.notice_datetime
            ? new Date(row.notice_datetime).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
        {row.attachment_url && (
          <a
            href={row.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            Attachment <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
