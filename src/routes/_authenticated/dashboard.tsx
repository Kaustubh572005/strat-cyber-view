import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCyberFeed, getLatestCves, type CyberArticle } from "@/lib/cyber.functions";
import { getMarketsIntel, type RegItem } from "@/lib/regulatory.functions";
import {
  ShieldAlert, Bug, FileText, Building2, Landmark, Newspaper, Sparkles,
  ArrowRight, TrendingUp, ExternalLink, Activity, Cpu, RefreshCw, ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const REFRESH_MS = 5 * 60 * 1000;

function DashboardPage() {
  const getFeed = useServerFn(getCyberFeed);
  const getCves = useServerFn(getLatestCves);
  const getMarkets = useServerFn(getMarketsIntel);

  const feedQ = useQuery({
    queryKey: ["cyber-feed"],
    queryFn: () => getFeed(),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });
  const cvesQ = useQuery({
    queryKey: ["latest-cves"],
    queryFn: () => getCves(),
    refetchInterval: REFRESH_MS,
    staleTime: 60 * 1000,
  });
  const marketsQ = useQuery({
    queryKey: ["markets-intel"],
    queryFn: () => getMarkets(),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  // Track ids we've already seen to flag "New" items across refreshes.
  const seenIdsRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [firstLoad, setFirstLoad] = useState(true);

  const allIds = useMemo(() => {
    const ids: string[] = [];
    feedQ.data?.top.forEach((a) => ids.push(a.id));
    feedQ.data?.ai.forEach((a) => ids.push(a.id));
    marketsQ.data?.grouped.sebi.forEach((a) => ids.push(a.id));
    marketsQ.data?.grouped.certIn.forEach((a) => ids.push(a.id));
    marketsQ.data?.grouped.nseCyber.forEach((a) => ids.push(a.id));
    marketsQ.data?.grouped.bseCyber.forEach((a) => ids.push(a.id));
    return ids;
  }, [feedQ.data, marketsQ.data]);

  useEffect(() => {
    if (allIds.length === 0) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(allIds);
      setFirstLoad(false);
      return;
    }
    const seen = seenIdsRef.current;
    const fresh = allIds.filter((id) => !seen.has(id));
    if (fresh.length > 0) {
      fresh.forEach((id) => seen.add(id));
      setNewIds((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.add(id));
        return next;
      });
      toast.success(`${fresh.length} new intelligence update${fresh.length === 1 ? "" : "s"}`, {
        description: "Dashboard refreshed with the latest information.",
      });
      // Auto-expire the "New" flag after 15 minutes so it doesn't stay forever.
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          fresh.forEach((id) => next.delete(id));
          return next;
        });
      }, 15 * 60 * 1000);
    }
  }, [allIds]);

  const cves = cvesQ.data ?? [];
  const critCves = cves.filter((c) => (c.cvss ?? 0) >= 9).length;
  const highCves = cves.filter((c) => (c.cvss ?? 0) >= 7 && (c.cvss ?? 0) < 9).length;
  const feed = feedQ.data;
  const markets = marketsQ.data;
  const today = new Date().toDateString();
  const anyLoading = feedQ.isFetching || cvesQ.isFetching || marketsQ.isFetching;

  const cyberToday = feed?.all.filter((a) => new Date(a.publishedAt).toDateString() === today).length ?? 0;
  const breachesWeek = feed?.all.filter((a) => {
    if (!/breach|ransomware|leak/i.test(`${a.title} ${a.snippet}`)) return false;
    return Date.now() - new Date(a.publishedAt).getTime() < 7 * 864e5;
  }).length ?? 0;

  const riskScore = useMemo(() => {
    const raw = critCves * 8 + highCves * 3 + breachesWeek * 4 + (markets?.kpis.certInAdvisories ?? 0) * 1.5;
    return Math.min(100, Math.round(raw));
  }, [critCves, highCves, breachesWeek, markets]);
  const riskBand = riskScore >= 75 ? "Elevated" : riskScore >= 50 ? "Moderate" : riskScore >= 25 ? "Guarded" : "Low";
  const riskColor = riskScore >= 75 ? "text-red-400" : riskScore >= 50 ? "text-orange-300" : riskScore >= 25 ? "text-yellow-300" : "text-emerald-400";

  const updatedAt = feed?.updatedAt ?? markets?.updatedAt;

  const isNew = (id: string) => !firstLoad && newIds.has(id);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cyber Command Center</div>
          <h1 className="text-3xl font-semibold neon-text mt-1">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Live aggregation of cyber threats, CVEs, SEBI, CERT-In, and exchange cybersecurity notices. Auto-refreshes every 5 minutes.
          </p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${anyLoading ? "animate-spin text-primary" : ""}`} />
          {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : "Loading…"}
        </div>
      </header>

      {/* KPI grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiTile to="/cyber" icon={Newspaper} label="Cyber news today" value={cyberToday} loading={feedQ.isLoading} />
        <KpiTile to="/markets" icon={Bug} label="Critical CVEs" value={critCves} loading={cvesQ.isLoading} accent />
        <KpiTile to="/markets" icon={Bug} label="High CVEs" value={highCves} loading={cvesQ.isLoading} />
        <KpiTile to="/markets" icon={ShieldAlert} label="CERT-In" value={markets?.kpis.certInAdvisories ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/sebi" icon={FileText} label="SEBI today" value={markets?.kpis.circularsToday ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/markets" icon={Building2} label="NSE Cyber" value={markets?.kpis.nseCyber ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/markets" icon={Landmark} label="BSE Cyber" value={markets?.kpis.bseCyber ?? 0} loading={marketsQ.isLoading} />
        <KpiTile to="/markets" icon={Activity} label="Breaches (7d)" value={breachesWeek} loading={feedQ.isLoading} />
      </section>

      {/* Brief + Risk */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-5 border border-primary/20 bg-primary/[0.03]">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary mb-2">
            <Sparkles className="h-3.5 w-3.5" /> Kaalu's Daily Brief
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

      {/* Cybersecurity News */}
      <FeedSection
        icon={Newspaper}
        title="Cybersecurity News"
        subtitle="Latest global cyber threat headlines"
        viewAllLabel="View All Cyber News"
        viewAllTo="/cyber"
        loading={feedQ.isLoading}
        empty="No cyber news available."
      >
        {(feed?.top ?? []).slice(0, 6).map((a) => (
          <CyberCard key={a.id} article={a} isNew={isNew(a.id)} />
        ))}
      </FeedSection>

      {/* SEBI Circulars */}
      <FeedSection
        icon={FileText}
        title="SEBI Circulars"
        subtitle="Latest official Securities and Exchange Board of India circulars"
        viewAllLabel="View All SEBI Circulars"
        viewAllTo="/sebi"
        loading={marketsQ.isLoading}
        empty="No SEBI circulars available right now."
      >
        {(markets?.grouped.sebi ?? []).slice(0, 6).map((a) => (
          <RegCard key={a.id} item={a} isNew={isNew(a.id)} tone="primary" />
        ))}
      </FeedSection>

      {/* CERT-In Advisories */}
      <FeedSection
        icon={ShieldAlert}
        title="CERT-In Advisories"
        subtitle="Indian Computer Emergency Response Team — official advisories"
        viewAllLabel="View All CERT-In Advisories"
        viewAllTo="/markets"
        loading={marketsQ.isLoading}
        empty="No CERT-In advisories available."
      >
        {(markets?.grouped.certIn ?? []).slice(0, 6).map((a) => (
          <RegCard key={a.id} item={a} isNew={isNew(a.id)} tone="red" showSeverity />
        ))}
      </FeedSection>

      {/* NSE Cybersecurity */}
      <FeedSection
        icon={Building2}
        title="NSE Cybersecurity Announcements"
        subtitle="Cybersecurity, information security and technology security notices from NSE"
        viewAllLabel="View All NSE Cybersecurity Announcements"
        viewAllTo="/markets"
        loading={marketsQ.isLoading}
        empty="No cybersecurity-specific NSE announcements right now."
      >
        {(markets?.grouped.nseCyber ?? []).slice(0, 6).map((a) => (
          <RegCard key={a.id} item={a} isNew={isNew(a.id)} tone="cyan" />
        ))}
      </FeedSection>

      {/* BSE Cybersecurity */}
      <FeedSection
        icon={Landmark}
        title="BSE Cybersecurity Announcements"
        subtitle="Cybersecurity, information security and technology security notices from BSE"
        viewAllLabel="View All BSE Cybersecurity Announcements"
        viewAllTo="/markets"
        loading={marketsQ.isLoading}
        empty="No cybersecurity-specific BSE announcements right now."
      >
        {(markets?.grouped.bseCyber ?? []).slice(0, 6).map((a) => (
          <RegCard key={a.id} item={a} isNew={isNew(a.id)} tone="amber" />
        ))}
      </FeedSection>

      {/* AI & Emerging Tech */}
      <FeedSection
        icon={Cpu}
        title="AI & Emerging Technology"
        subtitle="AI advances and their security implications"
        viewAllLabel="View All AI News"
        viewAllTo="/cyber"
        loading={feedQ.isLoading}
        empty="No AI news right now."
      >
        {(feed?.ai ?? []).slice(0, 6).map((a) => (
          <CyberCard key={a.id} article={a} isNew={isNew(a.id)} />
        ))}
      </FeedSection>
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

function FeedSection({
  icon: Icon, title, subtitle, viewAllLabel, viewAllTo, loading, empty, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; subtitle: string;
  viewAllLabel: string; viewAllTo: "/cyber" | "/markets" | "/sebi";
  loading?: boolean; empty: string; children: React.ReactNode;
}) {
  const count = Array.isArray(children) ? children.length : (children ? 1 : 0);
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
        <Link
          to={viewAllTo}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1 border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/10 transition"
        >
          {viewAllLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : count === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{empty}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
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

function CyberCard({ article, isNew }: { article: CyberArticle; isNew?: boolean }) {
  return (
    <Link
      to="/cyber/$articleId"
      params={{ articleId: article.id }}
      className="glass rounded-xl p-4 border border-white/5 hover:border-primary/40 transition block group"
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevColor[article.severity]}`}>{article.severity}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{article.source}</span>
        {isNew && <NewBadge />}
      </div>
      <div className="font-medium text-sm leading-snug group-hover:text-primary transition line-clamp-2">
        {article.title}
      </div>
      <div className="mt-2 flex items-start gap-1.5">
        <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground line-clamp-3">{article.snippet}</p>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{new Date(article.publishedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <span className="inline-flex items-center gap-1 group-hover:text-primary transition">
          Read <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

const toneBorder: Record<string, string> = {
  primary: "hover:border-primary/40",
  red: "hover:border-red-500/40",
  cyan: "hover:border-cyan-500/40",
  amber: "hover:border-amber-500/40",
};

function detectSev(text: string): "critical" | "high" | "medium" | "low" | "info" {
  const t = text.toLowerCase();
  if (/critical|zero.?day|actively exploited|severe/.test(t)) return "critical";
  if (/high|urgent|exploit|ransomware/.test(t)) return "high";
  if (/medium|moderate|advisory|warning/.test(t)) return "medium";
  return "info";
}

function RegCard({
  item, isNew, tone, showSeverity,
}: { item: RegItem; isNew?: boolean; tone: "primary" | "red" | "cyan" | "amber"; showSeverity?: boolean }) {
  const sev = showSeverity ? detectSev(`${item.title} ${item.snippet}`) : null;
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className={`glass rounded-xl p-4 border border-white/5 ${toneBorder[tone]} transition block group`}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 uppercase tracking-widest text-muted-foreground">
          {item.category}
        </span>
        {sev && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevColor[sev]}`}>{sev}</span>}
        {isNew && <NewBadge />}
      </div>
      <div className="font-medium text-sm leading-snug group-hover:text-primary transition line-clamp-2">
        {item.title}
      </div>
      {item.snippet && (
        <div className="mt-2 flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground line-clamp-3">{item.snippet}</p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{new Date(item.publishedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <span className="inline-flex items-center gap-1 group-hover:text-primary transition">
          Open <ExternalLink className="h-3 w-3" />
        </span>
      </div>
    </a>
  );
}
