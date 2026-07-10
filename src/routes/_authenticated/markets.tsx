import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarketsIntel, summarizeRegItem, type RegItem } from "@/lib/regulatory.functions";
import { getLatestCves, getCyberFeed, type CyberArticle } from "@/lib/cyber.functions";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, ShieldAlert, Building2, ExternalLink, Sparkles, Search, RefreshCw,
  Landmark, AlertTriangle, Bug,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/markets")({
  component: MarketsPage,
});

const TABS = [
  { id: "nse", label: "NSE Announcements", icon: Building2 },
  { id: "bse", label: "BSE Announcements", icon: Landmark },
  { id: "certin", label: "CERT-In Advisories", icon: ShieldAlert },
  { id: "vulns", label: "Vulnerabilities & Breaches", icon: Bug },
] as const;
type TabId = (typeof TABS)[number]["id"];

function MarketsPage() {
  const [tab, setTab] = useState<TabId>("nse");

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Regulatory & Market Intelligence</div>
          <h1 className="text-3xl font-semibold neon-text mt-1 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Financial Markets Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Four independent, source-of-truth feeds. Each section fetches, filters, and refreshes on its own.
          </p>
        </div>
      </header>

      <div className="glass rounded-xl p-2 border border-white/5 flex flex-wrap gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-2 rounded-md border transition inline-flex items-center gap-1.5 ${
                active
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-transparent text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "nse" && <ExchangeSection kind="nse" title="NSE India" homepage="https://www.nseindia.com" />}
      {tab === "bse" && <ExchangeSection kind="bse" title="BSE India" homepage="https://www.bseindia.com" />}
      {tab === "certin" && <CertInSection />}
      {tab === "vulns" && <VulnBreachSection />}
    </div>
  );
}

/* ---------- Independent section: NSE / BSE ---------- */
function ExchangeSection({ kind, title, homepage }: { kind: "nse" | "bse"; title: string; homepage: string }) {
  const getMarkets = useServerFn(getMarketsIntel);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["markets-intel", kind],
    queryFn: () => getMarkets(),
    staleTime: 5 * 60 * 1000,
    select: (d) => (kind === "nse" ? d.grouped.nse : d.grouped.bse),
  });
  const [q, setQ] = useState("");
  const items = data ?? [];
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((i) => !ql || `${i.title} ${i.snippet}`.toLowerCase().includes(ql));
  }, [items, q]);

  return (
    <SectionShell
      title={`${title} Announcements`}
      subtitle={`Circulars, exchange notices, trading notices, and market announcements from ${title}.`}
      count={items.length}
      homepage={homepage}
      onRefresh={() => refetch()}
      isFetching={isFetching}
      query={q}
      onQuery={setQ}
    >
      {isLoading && <FeedSkeleton />}
      {!isLoading && filtered.length === 0 && <EmptyState label={`No ${title} announcements right now.`} />}
      <div className="space-y-3">
        {filtered.map((it) => <FeedCard key={it.id} item={it} />)}
      </div>
    </SectionShell>
  );
}

/* ---------- Independent section: CERT-In ---------- */
function CertInSection() {
  const getMarkets = useServerFn(getMarketsIntel);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["markets-intel", "certin"],
    queryFn: () => getMarkets(),
    staleTime: 5 * 60 * 1000,
    select: (d) => d.grouped.certIn,
  });
  const [q, setQ] = useState("");
  const items = data ?? [];
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((i) => !ql || `${i.title} ${i.snippet}`.toLowerCase().includes(ql));
  }, [items, q]);

  return (
    <SectionShell
      title="CERT-In Advisories"
      subtitle="Security advisories, vulnerability notes, and incident bulletins from the Indian Computer Emergency Response Team."
      count={items.length}
      homepage="https://www.cert-in.org.in"
      onRefresh={() => refetch()}
      isFetching={isFetching}
      query={q}
      onQuery={setQ}
    >
      {isLoading && <FeedSkeleton />}
      {!isLoading && filtered.length === 0 && <EmptyState label="No CERT-In advisories in the current feed." />}
      <div className="space-y-3">
        {filtered.map((it) => <AdvisoryCard key={it.id} item={it} />)}
      </div>
    </SectionShell>
  );
}

/* ---------- Independent section: Vulnerabilities + Breaches ---------- */
function VulnBreachSection() {
  const getCves = useServerFn(getLatestCves);
  const getFeed = useServerFn(getCyberFeed);
  const cveQ = useQuery({
    queryKey: ["latest-cves"],
    queryFn: () => getCves(),
    staleTime: 10 * 60 * 1000,
  });
  const breachQ = useQuery({
    queryKey: ["breach-feed"],
    queryFn: () => getFeed(),
    staleTime: 10 * 60 * 1000,
    select: (d) =>
      d.all.filter((a) => /breach|ransomware|leak|hack|attack|zero.?day|exploit/i.test(`${a.title} ${a.snippet}`)).slice(0, 30),
  });
  const [severity, setSeverity] = useState<"all" | "critical" | "high">("all");
  const cves = (cveQ.data ?? []).filter((c) =>
    severity === "critical" ? (c.cvss ?? 0) >= 9 : severity === "high" ? (c.cvss ?? 0) >= 7 : true,
  );
  return (
    <SectionShell
      title="Vulnerabilities & Cyber Breaches"
      subtitle="Latest CVEs, zero-days, vendor advisories, ransomware and enterprise breach reports. Independent of CERT-In."
      count={(cveQ.data?.length ?? 0) + (breachQ.data?.length ?? 0)}
      homepage="https://nvd.nist.gov"
      onRefresh={() => {
        cveQ.refetch();
        breachQ.refetch();
      }}
      isFetching={cveQ.isFetching || breachQ.isFetching}
    >
      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Bug className="h-4 w-4 text-primary" /> Latest CVEs</h3>
            <div className="flex items-center gap-1">
              {(["all", "high", "critical"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`text-[11px] px-2 py-1 rounded border transition ${
                    severity === s ? "border-primary/60 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-white/30"
                  }`}
                >
                  {s === "all" ? "All" : s === "critical" ? "Critical (9+)" : "High (7+)"}
                </button>
              ))}
            </div>
          </div>
          <CveTable rows={cves} />
        </div>
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-primary" /> Recent Breaches & Incidents</h3>
          {breachQ.isLoading && <FeedSkeleton />}
          {!breachQ.isLoading && (breachQ.data?.length ?? 0) === 0 && <EmptyState label="No breach reports in the current feed." />}
          <div className="space-y-3">
            {(breachQ.data ?? []).map((a) => <BreachCard key={a.id} article={a} />)}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

/* ---------- Shared UI ---------- */
function SectionShell({
  title, subtitle, count, homepage, onRefresh, isFetching, query, onQuery, children,
}: {
  title: string; subtitle: string; count: number; homepage: string;
  onRefresh: () => void; isFetching: boolean;
  query?: string; onQuery?: (q: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="glass rounded-xl p-4 border border-white/5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{count} items</span>
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
        {onQuery && (
          <div className="relative mt-3 max-w-md">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search this section…" className="h-8 pl-8 bg-white/5 border-white/10" />
          </div>
        )}
      </div>
      {children}
      <div className="text-[11px] text-muted-foreground">
        Source: <a href={homepage} target="_blank" rel="noreferrer" className="underline hover:text-primary">{homepage.replace(/^https?:\/\//, "")}</a>
      </div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="glass rounded-xl p-6 border border-white/5 text-sm text-muted-foreground">{label}</div>;
}
function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass rounded-xl p-4 border border-white/5 animate-pulse">
          <div className="h-3 w-40 bg-white/5 rounded mb-2" />
          <div className="h-4 w-3/4 bg-white/10 rounded mb-2" />
          <div className="h-3 w-full bg-white/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function FeedCard({ item }: { item: RegItem }) {
  const [showAi, setShowAi] = useState(false);
  const summarize = useServerFn(summarizeRegItem);
  const { data: ai, isFetching } = useQuery({
    queryKey: ["reg-ai", item.id],
    queryFn: () => summarize({ data: { title: item.title, snippet: item.snippet, source: item.source } }),
    enabled: showAi,
    staleTime: 30 * 60 * 1000,
  });
  return (
    <article className="glass rounded-xl p-4 border border-white/5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{item.category}</span>
        <span>{new Date(item.publishedAt).toLocaleString()}</span>
      </div>
      <h2 className="text-base font-medium leading-snug">{item.title}</h2>
      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.snippet || "—"}</p>
      {showAi && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          {isFetching || !ai ? <span className="text-muted-foreground">Analyzing with Kaalu AI…</span> : (
            <>
              <div className="text-[10px] uppercase tracking-widest text-primary mb-1">AI Summary</div>
              <p>{ai.summary}</p>
              <div className="text-[10px] uppercase tracking-widest text-primary mt-2 mb-1">Impact</div>
              <p className="text-muted-foreground">{ai.impact}</p>
            </>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.link && (
          <a href={item.link} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
            Read full announcement <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAi((v) => !v)}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> {showAi ? "Hide AI summary" : "AI summary"}
        </Button>
      </div>
    </article>
  );
}

function AdvisoryCard({ item }: { item: RegItem }) {
  const [showAi, setShowAi] = useState(false);
  const summarize = useServerFn(summarizeRegItem);
  const severity = /critical/i.test(item.title) ? "Critical" : /high/i.test(item.title) ? "High" : /medium/i.test(item.title) ? "Medium" : "Advisory";
  const sevClass =
    severity === "Critical" ? "border-red-500/40 text-red-300 bg-red-500/10"
    : severity === "High" ? "border-orange-500/40 text-orange-300 bg-orange-500/10"
    : "border-white/10 text-muted-foreground";
  const { data: ai, isFetching } = useQuery({
    queryKey: ["reg-ai", item.id],
    queryFn: () => summarize({ data: { title: item.title, snippet: item.snippet, source: item.source } }),
    enabled: showAi,
    staleTime: 30 * 60 * 1000,
  });
  return (
    <article className="glass rounded-xl p-4 border border-white/5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
        <span className={`px-1.5 py-0.5 rounded border ${sevClass}`}>{severity}</span>
        <span>{new Date(item.publishedAt).toLocaleString()}</span>
      </div>
      <h2 className="text-base font-medium leading-snug">{item.title}</h2>
      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.snippet || "—"}</p>
      {showAi && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm space-y-2">
          {isFetching || !ai ? <span className="text-muted-foreground">Analyzing with Kaalu AI…</span> : (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary mb-1">AI Summary</div>
                <p>{ai.summary}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary mb-1">Recommended Mitigation</div>
                <p className="text-muted-foreground">{ai.impact}</p>
              </div>
            </>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.link && (
          <a href={item.link} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
            Open official advisory <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAi((v) => !v)}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> {showAi ? "Hide AI" : "AI summary & mitigation"}
        </Button>
      </div>
    </article>
  );
}

function BreachCard({ article }: { article: CyberArticle }) {
  return (
    <article className="glass rounded-xl p-4 border border-white/5">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{article.source}</span>
        <span>{new Date(article.publishedAt).toLocaleString()}</span>
      </div>
      <h4 className="text-base font-medium leading-snug">{article.title}</h4>
      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{article.snippet}</p>
      {article.link && (
        <a href={article.link} target="_blank" rel="noreferrer" className="mt-2 text-xs inline-flex items-center gap-1 text-primary hover:underline">
          Read full article <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </article>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`glass rounded-xl p-4 border ${accent ? "border-primary/40" : "border-white/5"}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function CveTable({ rows }: { rows: { id: string; cvss: number | null; severity: string; vendor: string; product: string; published: string; description: string }[] }) {
  const sorted = [...rows].sort((a, b) => (b.cvss ?? 0) - (a.cvss ?? 0));
  return (
    <div className="glass rounded-xl border border-white/5 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-widest text-muted-foreground bg-white/5">
          <tr>
            <th className="text-left p-3">CVE</th>
            <th className="text-left p-3">CVSS</th>
            <th className="text-left p-3">Vendor / Product</th>
            <th className="text-left p-3">Published</th>
            <th className="text-left p-3">Description</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
              <td className="p-3">
                <a href={`https://nvd.nist.gov/vuln/detail/${r.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {r.id}
                </a>
              </td>
              <td className="p-3">
                <span className={`px-1.5 rounded border text-[11px] ${(r.cvss ?? 0) >= 9 ? "border-red-500/40 text-red-300 bg-red-500/10" : (r.cvss ?? 0) >= 7 ? "border-orange-500/40 text-orange-300 bg-orange-500/10" : "border-white/10 text-muted-foreground"}`}>
                  {r.cvss?.toFixed(1) ?? "—"} {r.severity}
                </span>
              </td>
              <td className="p-3 text-xs">{r.vendor} / {r.product}</td>
              <td className="p-3 text-xs text-muted-foreground">{new Date(r.published).toLocaleDateString()}</td>
              <td className="p-3 text-xs">{r.description}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No recent CVEs.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}