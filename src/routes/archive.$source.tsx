import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listFeed, type FeedSourceKey } from "@/lib/feeds.functions";
import { AppShell } from "@/components/AppShell";
import { FeedCard, EmptyFeed } from "@/components/FeedCard";
import { ArrowLeft } from "lucide-react";

const LABELS: Record<FeedSourceKey, string> = {
  news: "Cybersecurity News Archive",
  certin: "CERT-In Advisories",
  sebi: "SEBI Circulars",
  nse: "NSE Cybersecurity Announcements",
  bse: "BSE Cybersecurity Announcements",
};

const VALID = ["news", "certin", "sebi", "nse", "bse"] as const;

function isSource(x: string): x is FeedSourceKey {
  return (VALID as readonly string[]).includes(x);
}

const archiveQuery = (source: FeedSourceKey) =>
  queryOptions({
    queryKey: ["feed", source, "archive"],
    queryFn: () => listFeed({ data: { source, limit: 60 } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/archive/$source")({
  loader: async ({ context, params }) => {
    if (!isSource(params.source)) throw notFound();
    await context.queryClient.ensureQueryData(archiveQuery(params.source));
  },
  head: ({ params }) => ({
    meta: [
      { title: `${LABELS[params.source as FeedSourceKey] ?? "Archive"} · Kaalu AI` },
      {
        name: "description",
        content: `Complete searchable archive of ${LABELS[params.source as FeedSourceKey] ?? "cyber intelligence"}.`,
      },
    ],
  }),
  component: ArchivePage,
  errorComponent: ({ error }) => (
    <AppShell><div className="panel p-6 text-destructive">{error.message}</div></AppShell>
  ),
  notFoundComponent: () => (
    <AppShell><div className="panel p-6">Unknown source.</div></AppShell>
  ),
});

function ArchivePage() {
  const params = Route.useParams();
  const source = params.source as FeedSourceKey;
  const { data } = useSuspenseQuery(archiveQuery(source));
  return (
    <AppShell>
      <Link to="/" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Command Center
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{LABELS[source]}</h1>
      <p className="mt-1 text-sm text-muted-foreground mb-6">
        {data.length} item{data.length === 1 ? "" : "s"} · sorted by publish date
      </p>
      {data.length === 0 ? (
        <EmptyFeed label={LABELS[source]} />
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((it) => <FeedCard key={it.id} item={it} />)}
        </div>
      )}
    </AppShell>
  );
}
