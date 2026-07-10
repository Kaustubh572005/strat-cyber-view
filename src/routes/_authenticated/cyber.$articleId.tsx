import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCyberArticle, getCyberFeed } from "@/lib/cyber.functions";
import { ArrowLeft, ArrowRight, ExternalLink, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cyber/$articleId")({
  component: ArticleDetail,
});

const sevColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  info: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

function ArticleDetail() {
  const { articleId } = Route.useParams();
  const navigate = useNavigate();
  const getArt = useServerFn(getCyberArticle);
  const getFeed = useServerFn(getCyberFeed);

  const { data: feed } = useQuery({
    queryKey: ["cyber-feed"],
    queryFn: () => getFeed(),
    staleTime: 5 * 60 * 1000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["cyber-article", articleId],
    queryFn: () => getArt({ data: { id: articleId } }),
  });

  const list = feed?.top ?? [];
  const idx = list.findIndex((a) => a.id === articleId);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <button
        onClick={() => navigate({ to: "/cyber" })}
        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mb-4"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to Cyber Intelligence
      </button>

      {isLoading && <div className="text-sm text-muted-foreground">Loading article…</div>}
      {!isLoading && !data && (
        <div className="text-sm text-muted-foreground">Article not found or feed refreshed. <Link to="/cyber" className="text-primary">Return</Link></div>
      )}

      {data && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>{data.article.source}</span>
            <span>·</span>
            <span>{new Date(data.article.publishedAt).toLocaleString()}</span>
            <span className={`ml-2 px-1.5 rounded border ${sevColor[data.article.severity]}`}>{data.article.severity}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold neon-text leading-tight">{data.article.title}</h1>
          <a
            href={data.article.link}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Read original <ExternalLink className="h-3 w-3" />
          </a>

          <section className="mt-6 glass rounded-xl p-5 border border-white/5">
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-2">AI Summary</h2>
            <p className="text-sm leading-relaxed">{data.detail.summary}</p>
          </section>

          <section className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass rounded-xl p-4 border border-white/5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Risk Assessment</h3>
              <p className="text-sm">{data.detail.risk}</p>
            </div>
            <div className="glass rounded-xl p-4 border border-white/5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Recommended Mitigation</h3>
              <ul className="text-sm list-disc pl-4 space-y-1">
                {data.detail.mitigation.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoList label="Affected Products" items={data.detail.products} />
            <InfoList label="CVEs" items={data.article.cves} linkTo={(c) => `https://nvd.nist.gov/vuln/detail/${c}`} />
            <InfoList label="Tags" items={data.detail.tags} />
          </section>

          <nav className="mt-8 flex items-center justify-between border-t border-white/5 pt-4">
            {prev ? (
              <Button variant="ghost" onClick={() => navigate({ to: "/cyber/$articleId", params: { articleId: prev.id } })}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
            ) : <div />}
            <div className="text-xs text-muted-foreground">
              {idx >= 0 ? `News ${idx + 1} of ${list.length}` : ""}
            </div>
            {next ? (
              <Button variant="ghost" onClick={() => navigate({ to: "/cyber/$articleId", params: { articleId: next.id } })}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : <div />}
          </nav>
        </>
      )}
    </div>
  );
}

function InfoList({ label, items, linkTo }: { label: string; items: string[]; linkTo?: (v: string) => string }) {
  return (
    <div className="glass rounded-xl p-4 border border-white/5">
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{label}</h3>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((v) => (
            linkTo ? (
              <a key={v} href={linkTo(v)} target="_blank" rel="noreferrer" className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hover:text-primary">{v}</a>
            ) : (
              <span key={v} className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{v}</span>
            )
          ))}
        </div>
      )}
    </div>
  );
}