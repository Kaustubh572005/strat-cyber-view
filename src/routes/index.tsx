import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllFeeds, refreshFeeds } from "@/lib/feeds.functions";
import { AppShell } from "@/components/AppShell";
import { FeedCard, EmptyFeed } from "@/components/FeedCard";
import {
  Newspaper,
  ShieldAlert,
  FileText,
  Building2,
  Landmark,
  RefreshCw,
  ArrowRight,
  Activity,
} from "lucide-react";

const feedsQuery = queryOptions({
  queryKey: ["feeds", "dashboard"],
  queryFn: () => listAllFeeds(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const cached = await context.queryClient.ensureQueryData(feedsQuery);
    const isEmpty = Object.values(cached).every((arr) => arr.length === 0);
    if (isEmpty) {
      try {
        await refreshFeeds({ data: {} });
        await context.queryClient.invalidateQueries({ queryKey: ["feeds"] });
        await context.queryClient.ensureQueryData(feedsQuery);
      } catch { /* non-blocking */ }
    } else {
      // Fire-and-forget refresh so next visit is fresh.
      refreshFeeds({ data: {} })
        .then(() => context.queryClient.invalidateQueries({ queryKey: ["feeds"] }))
        .catch(() => {});
    }
  },
  component: Dashboard,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="panel p-6 text-sm text-destructive">Failed to load dashboard: {error.message}</div>
    </AppShell>
  ),
  notFoundComponent: () => <AppShell><div className="p-6">Nothing here.</div></AppShell>,
});

const SECTIONS = [
  { key: "news", label: "Cybersecurity News", icon: Newspaper, href: "/archive/news" },
  { key: "certin", label: "CERT-In Advisories", icon: ShieldAlert, href: "/archive/certin" },
  { key: "sebi", label: "SEBI Circulars", icon: FileText, href: "/archive/sebi" },
  { key: "nse", label: "NSE Cybersecurity", icon: Building2, href: "/archive/nse" },
  { key: "bse", label: "BSE Cybersecurity", icon: Landmark, href: "/archive/bse" },
] as const;

function Dashboard() {
  const router = useRouter();
  const { data } = useSuspenseQuery(feedsQuery);
  const refreshFn = useServerFn(refreshFeeds);
  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: {} }),
    onSettled: () => router.invalidate(),
  });

  const totals = SECTIONS.map((s) => ({
    ...s,
    items: data[s.key] ?? [],
    newCount: (data[s.key] ?? []).filter((i) => i.is_new).length,
  }));
  const criticalCount = Object.values(data)
    .flat()
    .filter((i) => i.severity === "critical" || i.severity === "high").length;

  return (
    <AppShell>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary/80 font-mono">
            /// live operations
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Cyber Command Center
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Aggregated intelligence from global threat feeds and Indian regulators — CERT-In,
            SEBI, NSE, and BSE. AI-summarised in real time.
          </p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refresh.isPending ? "animate-spin" : ""}`} />
          {refresh.isPending ? "Scanning feeds…" : "Refresh feeds"}
        </button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatTile label="Live feeds" value="5" hint="sources online" />
        <StatTile
          label="Items tracked"
          value={String(Object.values(data).reduce((a, b) => a + b.length, 0))}
          hint="last 6 per source"
        />
        <StatTile
          label="New (24h)"
          value={String(totals.reduce((a, b) => a + b.newCount, 0))}
          hint="unseen items"
          highlight
        />
        <StatTile
          label="High / critical"
          value={String(criticalCount)}
          hint="severity flagged"
          tone={criticalCount > 0 ? "danger" : undefined}
        />
      </section>

      <div className="space-y-10">
        {totals.map((s) => (
          <section key={s.key}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <s.icon className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-tight">{s.label}</h2>
                {s.newCount > 0 && (
                  <span className="chip border-neon/60 text-neon bg-neon/10">
                    {s.newCount} new
                  </span>
                )}
              </div>
              <Link
                to={s.href}
                className="text-xs inline-flex items-center gap-1 text-primary hover:underline"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {s.items.length === 0 ? (
              <EmptyFeed label={s.label} />
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {s.items.map((it) => <FeedCard key={it.id} item={it} />)}
              </div>
            )}
          </section>
        ))}
      </div>
    </AppShell>
  );
}

function StatTile({
  label,
  value,
  hint,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
  tone?: "danger";
}) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : highlight
      ? "text-neon"
      : "text-primary";
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Activity className="w-3 h-3" /> {label}
      </div>
      <div className={`mt-2 text-3xl font-mono font-semibold ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
