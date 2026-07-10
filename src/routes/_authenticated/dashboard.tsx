import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCyberFeed, getLatestCves } from "@/lib/cyber.functions";
import { getMarketsIntel } from "@/lib/regulatory.functions";
import {
  ShieldAlert, Bug, FileText, Building2, Landmark, Newspaper, Sparkles,
  ArrowRight, TrendingUp, ExternalLink, Activity,
} from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const getFeed = useServerFn(getCyberFeed);
  const getCves = useServerFn(getLatestCves);
  const getMarkets = useServerFn(getMarketsIntel);

  const feedQ = useQuery({ queryKey: ["cyber-feed"], queryFn: () => getFeed(), staleTime: 5 * 60 * 1000 });
  const cvesQ = useQuery({ queryKey: ["latest-cves"], queryFn: () => getCves(), staleTime: 10 * 60 * 1000 });
  const marketsQ = useQuery({ queryKey: ["markets-intel"], queryFn: () => getMarkets(), staleTime: 5 * 60 * 1000 });

  const cves = cvesQ.data ?? [];
  const critCves = cves.filter((c) => (c.cvss ?? 0) >= 9).length;
  const highCves = cves.filter((c) => (c.cvss ?? 0) >= 7 && (c.cvss ?? 0) < 9).length;
  const feed = feedQ.data;
  const markets = marketsQ.data;
  const today = new Date().toDateString();

  const cyberToday = feed?.all.filter((a) => new Date(a.publishedAt).toDateString() === today).length ?? 0;
  const breachesWeek = feed?.all.filter((a) => {
    if (!/breach|ransomware|leak/i.test(`${a.title} ${a.snippet}`)) return false;
    return Date.now() - new Date(a.publishedAt).getTime() < 7 * 864e5;
  }).length ?? 0;

  // Cyber Risk Score: weighted composite (0–100)
  const riskScore = useMemo(() => {
    const raw = critCves * 8 + highCves * 3 + breachesWeek * 4 + (markets?.kpis.certInAdvisories ?? 0) * 1.5;
    return Math.min(100, Math.round(raw));
  }, [critCves, highCves, breachesWeek, markets]);
  const riskBand = riskScore >= 75 ? "Elevated" : riskScore >= 50 ? "Moderate" : riskScore >= 25 ? "Guarded" : "Low";
  const riskColor = riskScore >= 75 ? "text-red-400" : riskScore >= 50 ? "text-orange-300" : riskScore >= 25 ? "text-yellow-300" : "text-emerald-400";

  const criticalItems = [
    ...cves.filter((c) => (c.cvss ?? 0) >= 9).slice(0, 3).map((c) => ({
      kind: "CVE", title: `${c.id} · ${c.vendor} ${c.product}`, meta: `CVSS ${c.cvss?.toFixed(1)} ${c.severity}`,
      link: `https://nvd.nist.gov/vuln/detail/${c.id}`, date: c.published,
    })),
    ...(markets?.grouped.certIn ?? []).filter((a) => /critical|high|severe/i.test(a.title)).slice(0, 3).map((a) => ({
      kind: "CERT-In", title: a.title, meta: "CERT-In advisory", link: a.link, date: a.publishedAt,
    })),
  ].slice(0, 6);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Command Center</div>
        <h1 className="text-3xl font-semibold neon-text mt-1">Good day, Sir</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Live overview across cyber threats, CVEs, exchanges, and regulators. Every tile drills into its module.
        </p>
      </header>

      {/* KPI grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiTile to="/cyber" icon={Newspaper} label="Cyber news today" value={cyberToday} loading={feedQ.isLoading} />
        <KpiTile to="/markets" icon={Bug} label="Critical CVEs" value={critCves} loading={cvesQ.isLoading} accent />
        <KpiTile to="/markets" icon={Bug} label="High CVEs" value={highCves} loading={cvesQ.isLoading} />
        <KpiTile to="/markets" icon={ShieldAlert} label="CERT-In advisories" value={markets?.kpis.certInAdvisories ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/sebi" icon={FileText} label="SEBI today" value={markets?.kpis.circularsToday ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/markets" icon={Building2} label="NSE notices" value={markets?.kpis.nseAnnouncements ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/markets" icon={Landmark} label="BSE notices" value={markets?.kpis.bseAnnouncements ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/markets" icon={Activity} label="Breaches (7d)" value={breachesWeek} loading={feedQ.isLoading} />
      </section>

      {/* AI Brief + Risk Score */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-5 border border-primary/20 bg-primary/[0.03]">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary mb-2">
            <Sparkles className="h-3.5 w-3.5" /> Kaalu&apos;s Daily Brief
          </div>
          <p className="text-sm leading-relaxed">
            Good day, Sir. Today the feed shows{" "}
            <b className="text-foreground">{critCves} critical</b> and{" "}
            <b className="text-foreground">{highCves} high-severity</b> vulnerabilities,{" "}
            <b className="text-foreground">{markets?.kpis.certInAdvisories ?? 0}</b> CERT-In advisories, and{" "}
            <b className="text-foreground">{markets?.kpis.circularsToday ?? 0}</b> new SEBI circulars.{" "}
            {breachesWeek > 0 ? (
              <>There have been <b className="text-foreground">{breachesWeek}</b> breach or ransomware reports this week — recommend reviewing the Vulnerabilities section.</>
            ) : (
              <>No major breach reports this week. Focus on the top CVEs listed below.</>
            )}
          </p>
        </div>
        <div className="glass rounded-2xl p-5 border border-white/5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            <TrendingUp className="h-3.5 w-3.5" /> Cyber Risk Score
          </div>
          <div className={`text-4xl font-semibold ${riskColor}`}>{riskScore}<span className="text-lg text-muted-foreground">/100</span></div>
          <div className={`text-xs mt-1 ${riskColor}`}>{riskBand}</div>
          <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full ${riskScore >= 75 ? "bg-red-400" : riskScore >= 50 ? "bg-orange-300" : riskScore >= 25 ? "bg-yellow-300" : "bg-emerald-400"}`} style={{ width: `${riskScore}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Composite of critical CVEs, CERT-In advisories, and breach velocity.
          </p>
        </div>
      </section>

      {/* Critical Alerts */}
      <section className="glass rounded-2xl p-5 border border-red-500/20">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-red-300">
            <ShieldAlert className="h-4 w-4" /> Critical Alert Center
          </h2>
          <Link to="/markets" className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {criticalItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">No critical alerts right now. Kaalu is monitoring.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {criticalItems.map((it, i) => (
              <li key={i} className="py-2.5 flex items-start gap-3">
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-300 shrink-0 mt-0.5">{it.kind}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{it.title}</div>
                  <div className="text-[11px] text-muted-foreground">{it.meta} · {new Date(it.date).toLocaleDateString()}</div>
                </div>
                {it.link && (
                  <a href={it.link} target="_blank" rel="noreferrer" className="text-primary shrink-0"><ExternalLink className="h-3.5 w-3.5" /></a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Preview strips */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PreviewStrip title="Top Cyber News" to="/cyber" items={(feed?.top ?? []).slice(0, 4).map((a) => ({ title: a.title, meta: a.source, date: a.publishedAt, link: a.link }))} loading={feedQ.isLoading} />
        <PreviewStrip title="AI & Emerging Tech" to="/cyber" items={(feed?.ai ?? []).slice(0, 4).map((a) => ({ title: a.title, meta: a.source, date: a.publishedAt, link: a.link }))} loading={feedQ.isLoading} />
        <PreviewStrip title="SEBI Circulars" to="/sebi" items={(markets?.grouped.sebi ?? []).slice(0, 4).map((a) => ({ title: a.title, meta: a.category, date: a.publishedAt, link: a.link }))} loading={marketsQ.isLoading} />
        <PreviewStrip title="CERT-In Advisories" to="/markets" items={(markets?.grouped.certIn ?? []).slice(0, 4).map((a) => ({ title: a.title, meta: "Advisory", date: a.publishedAt, link: a.link }))} loading={marketsQ.isLoading} />
        <PreviewStrip title="NSE Announcements" to="/markets" items={(markets?.grouped.nse ?? []).slice(0, 4).map((a) => ({ title: a.title, meta: "NSE", date: a.publishedAt, link: a.link }))} loading={marketsQ.isLoading} />
        <PreviewStrip title="BSE Announcements" to="/markets" items={(markets?.grouped.bse ?? []).slice(0, 4).map((a) => ({ title: a.title, meta: "BSE", date: a.publishedAt, link: a.link }))} loading={marketsQ.isLoading} />
      </section>
    </div>
  );
}

function KpiTile({
  to, icon: Icon, label, value, loading, accent,
}: {
  to: "/cyber" | "/markets" | "/sebi" | "/mail" | "/presentations" | "/voice";
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; loading?: boolean; accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group glass rounded-xl p-3.5 border transition ${accent ? "border-primary/40 hover:border-primary/70" : "border-white/5 hover:border-white/20"}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-primary" : ""}`}>
        {loading ? <span className="inline-block h-6 w-10 bg-white/5 rounded animate-pulse" /> : value}
      </div>
    </Link>
  );
}

function PreviewStrip({
  title, to, items, loading,
}: {
  title: string;
  to: "/cyber" | "/markets" | "/sebi";
  items: { title: string; meta: string; date: string; link?: string }[];
  loading?: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-5 border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link to={to} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4">No items yet.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm flex items-start gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 shrink-0 mt-0.5">{it.meta}</span>
              <a
                href={it.link || "#"}
                target={it.link ? "_blank" : undefined}
                rel="noreferrer"
                className="flex-1 min-w-0 truncate hover:text-primary transition"
                title={it.title}
              >
                {it.title}
              </a>
              <span className="text-[10px] text-muted-foreground shrink-0">{new Date(it.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}