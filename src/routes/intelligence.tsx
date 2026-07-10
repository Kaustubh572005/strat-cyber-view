import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listFeed } from "@/lib/feeds.functions";
import { AppShell } from "@/components/AppShell";
import { FeedCard, EmptyFeed } from "@/components/FeedCard";
import { Radar, ShieldAlert } from "lucide-react";

const intelQuery = queryOptions({
  queryKey: ["intel", "combined"],
  queryFn: async () => {
    const [news, certin] = await Promise.all([
      listFeed({ data: { source: "news", limit: 30 } }),
      listFeed({ data: { source: "certin", limit: 20 } }),
    ]);
    return [...news, ...certin].sort((a, b) => {
      const ta = new Date(a.published_at ?? a.first_seen_at).getTime();
      const tb = new Date(b.published_at ?? b.first_seen_at).getTime();
      return tb - ta;
    });
  },
  staleTime: 30_000,
});

export const Route = createFileRoute("/intelligence")({
  loader: ({ context }) => context.queryClient.ensureQueryData(intelQuery),
  head: () => ({
    meta: [
      { title: "Cyber Threat Intelligence · Kaalu AI" },
      {
        name: "description",
        content:
          "Global cyber threat intelligence portal — vulnerabilities, breaches, and CERT-In advisories with AI summaries.",
      },
    ],
  }),
  component: IntelPage,
  errorComponent: ({ error }) => (
    <AppShell><div className="panel p-6 text-destructive">{error.message}</div></AppShell>
  ),
  notFoundComponent: () => <AppShell><div /></AppShell>,
});

function IntelPage() {
  const { data } = useSuspenseQuery(intelQuery);
  const critical = data.filter((i) => i.severity === "critical" || i.severity === "high");
  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.3em] text-primary/80 font-mono">
          /// threat intelligence portal
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Radar className="w-7 h-7 text-primary" /> Cyber Intelligence
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Live feed of vulnerabilities, breaches, and advisories. Every card links to the AI
          briefing with previous/next navigation and the original source.
        </p>
      </div>

      {critical.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-widest text-destructive font-mono mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Elevated severity
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {critical.slice(0, 6).map((it) => <FeedCard key={it.id} item={it} />)}
          </div>
        </section>
      )}

      <h2 className="text-sm uppercase tracking-widest text-muted-foreground font-mono mb-3">
        All intelligence
      </h2>
      {data.length === 0 ? (
        <EmptyFeed label="threat intelligence" />
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((it) => <FeedCard key={it.id} item={it} />)}
        </div>
      )}

      <div className="mt-8 text-xs text-muted-foreground">
        <Link to="/archive/certin" className="text-primary hover:underline">
          Full CERT-In archive →
        </Link>
      </div>
    </AppShell>
  );
}
