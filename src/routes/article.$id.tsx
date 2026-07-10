import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getArticle } from "@/lib/feeds.functions";
import { AppShell } from "@/components/AppShell";
import { ArrowLeft, ArrowRight, ExternalLink, Sparkles, Clock } from "lucide-react";

const articleQuery = (id: string) =>
  queryOptions({
    queryKey: ["article", id],
    queryFn: () => getArticle({ data: { id } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/article/$id")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(articleQuery(params.id));
  },
  head: () => ({
    meta: [
      { title: "Article · Kaalu AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ArticlePage,
  errorComponent: ({ error }) => (
    <AppShell><div className="panel p-6 text-destructive">{error.message}</div></AppShell>
  ),
  notFoundComponent: () => (
    <AppShell><div className="panel p-6">Article not found.</div></AppShell>
  ),
});

function ArticlePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(articleQuery(id));
  const { article, prev, next } = data;

  return (
    <AppShell>
      <Link
        to="/archive/$source"
        params={{ source: article.source }}
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" /> Back to archive
      </Link>

      <article className="mt-4 panel p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {article.publisher && (
            <span className="chip text-primary border-primary/30">{article.publisher}</span>
          )}
          {article.severity && (
            <span className="chip text-destructive border-destructive/40">{article.severity}</span>
          )}
          <span className="inline-flex items-center gap-1 text-muted-foreground ml-auto">
            <Clock className="w-3 h-3" />
            {article.published_at
              ? new Date(article.published_at).toLocaleString()
              : new Date(article.first_seen_at).toLocaleString()}
          </span>
        </div>

        <h1 className="mt-4 text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
          {article.title}
        </h1>

        <section className="mt-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary/80 font-mono">
            <Sparkles className="w-3.5 h-3.5" /> Full AI Summary
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">
            {article.ai_summary ??
              article.description ??
              "AI summary unavailable for this item — open the original article for full context."}
          </p>
        </section>

        {article.description && article.ai_summary && (
          <section className="mt-8">
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-mono">
              Original excerpt
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {article.description}
            </p>
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Read Full Article <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent"
          >
            Original Source
          </a>
        </div>
      </article>

      <nav className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {prev ? (
          <Link
            to="/article/$id"
            params={{ id: prev.id }}
            className="panel p-4 hover:border-primary/50 transition-colors"
          >
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Previous
            </div>
            <div className="mt-1 text-sm font-medium line-clamp-2">{prev.title}</div>
          </Link>
        ) : <div />}
        {next ? (
          <Link
            to="/article/$id"
            params={{ id: next.id }}
            className="panel p-4 hover:border-primary/50 transition-colors md:text-right"
          >
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-1 md:justify-end">
              Next <ArrowRight className="w-3 h-3" />
            </div>
            <div className="mt-1 text-sm font-medium line-clamp-2">{next.title}</div>
          </Link>
        ) : <div />}
      </nav>
    </AppShell>
  );
}
