import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCyberFeed, getLatestCves, CYBER_SOURCES } from "@/lib/cyber.functions";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  Bug,
  Newspaper,
  Building2,
  Globe2,
  Radio,
  ExternalLink,
  Clock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { listArticles, listSourceStatus, refreshSource } from "@/lib/feeds.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";


export const Route = createFileRoute("/_authenticated/cyber")({
  component: CyberPage,
});

// Feeds are synchronised server-side every 6 hours; the UI polls on the same
// cadence so no AI credits are spent re-processing existing intelligence.
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const sevColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  info: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

function CyberPage() {
  const feed = useServerFn(getCyberFeed);
  const cves = useServerFn(getLatestCves);
  const { data, isLoading } = useQuery({
    queryKey: ["cyber-feed"],
    queryFn: () => feed(),
    refetchInterval: SIX_HOURS_MS,
    staleTime: 60 * 1000,
  });
  const { data: cveRows = [] } = useQuery({
    queryKey: ["cyber-cves"],
    queryFn: () => cves(),
    staleTime: 10 * 60 * 1000,
  });

  const [cveSeverity, setCveSeverity] = useState<string>("ALL");

  // ---- Stored news intelligence: cyber, AI & technology from every source
  // (LiveMint included, treated exactly like the others — no separate section).
  const NEWS_SOURCES = ["cyber-news", "ai-news", "livemint"];
  const fetchNews = useServerFn(listArticles);
  const fetchStatus = useServerFn(listSourceStatus);
  const doRefresh = useServerFn(refreshSource);
  const qc = useQueryClient();
  const [newsFilter, setNewsFilter] = useState<string>("ALL");

  const { data: newsArticles = [], isLoading: newsLoading } = useQuery({
    queryKey: ["news-articles"],
    queryFn: () => fetchNews({ data: { source_keys: NEWS_SOURCES, limit: 120 } }),
    refetchInterval: SIX_HOURS_MS,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sourceStatus = [] } = useQuery({
    queryKey: ["source-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: SIX_HOURS_MS,
  });
  const newsStatuses = sourceStatus.filter((s) => NEWS_SOURCES.includes(s.source_key));
  const lastNewsSync = newsStatuses
    .map((s) => s.last_synced_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  const refreshMutation = useMutation({
    mutationFn: () => doRefresh({ data: { source_key: "all" } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["news-articles"] });
      qc.invalidateQueries({ queryKey: ["source-status"] });
    },
  });

  const newsCategories = useMemo(
    () => [
      "ALL",
      ...Array.from(new Set(newsArticles.map((a) => a.category).filter(Boolean) as string[])),
    ],
    [newsArticles],
  );
  const newsFiltered = useMemo(
    () => (newsFilter === "ALL" ? newsArticles : newsArticles.filter((a) => a.category === newsFilter)),
    [newsArticles, newsFilter],
  );
  const nextSync = lastNewsSync
    ? new Date(new Date(lastNewsSync).getTime() + SIX_HOURS_MS)
    : null;

  const filteredCves = useMemo(
    () => (cveSeverity === "ALL" ? cveRows : cveRows.filter((c) => c.severity === cveSeverity)),
    [cveRows, cveSeverity],
  );

  const kpis = data?.kpis;
  const flashItems = data?.top.slice(0, 6) ?? [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Cyber Threat Intelligence
          </div>
          <h1 className="text-3xl font-semibold neon-text mt-1">Cyber Intelligence Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live threat feed, CVEs, advisories, and AI-driven summaries.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {data ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}` : "Loading…"}
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Kpi label="News Today" value={kpis?.totalToday ?? "…"} icon={<Newspaper className="h-4 w-4" />} />
        <Kpi label="Critical" value={kpis?.critical ?? "…"} icon={<AlertTriangle className="h-4 w-4 text-red-400" />} accent="red" />
        <Kpi label="High Sev" value={kpis?.high ?? "…"} icon={<ShieldAlert className="h-4 w-4 text-orange-400" />} accent="orange" />
        <Kpi label="Latest CVEs" value={kpis?.latestCves ?? "…"} icon={<Bug className="h-4 w-4" />} />
        <Kpi label="Malware" value={kpis?.activeMalware ?? "…"} icon={<Radio className="h-4 w-4" />} />
        <Kpi label="Breaches" value={kpis?.breaches ?? "…"} icon={<AlertTriangle className="h-4 w-4" />} />
        <Kpi label="Vendors" value={kpis?.vendors ?? "…"} icon={<Building2 className="h-4 w-4" />} />
        <Kpi label="Countries" value={kpis?.countries ?? "…"} icon={<Globe2 className="h-4 w-4" />} />
      </section>

      {/* Daily Cyber Flash marquee */}
      <section className="glass rounded-xl border border-primary/20 overflow-hidden">
        <div className="flex items-stretch">
          <div className="bg-primary/20 text-primary px-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> Daily Flash
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="flex gap-8 py-2.5 animate-[marquee_60s_linear_infinite] whitespace-nowrap">
              {[...flashItems, ...flashItems].map((f, i) => (
                <a key={i} href={f.link} target="_blank" rel="noreferrer" className="text-sm hover:text-primary">
                  <span className={`inline-block px-1.5 rounded text-[10px] mr-2 border ${sevColor[f.severity]}`}>
                    {f.severity.toUpperCase()}
                  </span>
                  {f.title}
                  <span className="text-muted-foreground"> — {f.source}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Top 10 news + sources */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Top 10 Cybersecurity News</h2>
          {isLoading && <div className="text-sm text-muted-foreground">Loading feed…</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data?.top.map((a, idx) => (
              <Link
                key={a.id}
                to="/cyber/$articleId"
                params={{ articleId: a.id }}
                className="glass rounded-xl p-4 border border-border hover:border-primary/40 transition block"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  <span className="text-primary">#{idx + 1}</span>
                  <span>{a.source}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.readingMinutes} min</span>
                  <span className={`ml-auto px-1.5 rounded border ${sevColor[a.severity]}`}>{a.severity}</span>
                </div>
                <div className="font-medium text-sm leading-snug">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{a.snippet}</div>
                {a.cves.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.cves.slice(0, 3).map((c) => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border">{c}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>

        <aside>
          <h2 className="text-lg font-semibold mb-3">Trusted Sources</h2>
          <div className="space-y-2">
            {CYBER_SOURCES.map((s) => {
              const items = data?.all.filter((a) => a.sourceId === s.id) ?? [];
              const latest = items[0];
              return (
                <div key={s.id} className="glass rounded-lg p-3 border border-border">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{s.name}</div>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {latest ? (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{latest.title}</div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-1">—</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">{items.length} new</div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      {/* LiveMint — official livemint.com cyber / technology intelligence */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold">LiveMint — Cyber & Technology News</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Official source:{" "}
              <a
                href="https://www.livemint.com/"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                livemint.com
              </a>{" "}
              · stored permanently, only new articles are summarised by AI.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-muted-foreground text-right leading-tight">
              <div>
                Last sync:{" "}
                {lmStatus?.last_synced_at
                  ? new Date(lmStatus.last_synced_at).toLocaleString()
                  : "not yet"}
                {lmStatus?.last_status === "error" && (
                  <span className="ml-1 text-red-500">(failed — showing stored articles)</span>
                )}
              </div>
              <div>Next scheduled sync: {nextSync ? nextSync.toLocaleString() : "within 6 hours"}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`}
              />
              {refreshMutation.isPending ? "Refreshing…" : "Refresh Now"}
            </Button>
          </div>
        </div>

        {lmCategories.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {lmCategories.map((c) => (
              <button
                key={c}
                onClick={() => setLmFilter(c)}
                className={`text-[11px] px-2 py-1 rounded border ${lmFilter === c ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {lmLoading && <div className="text-sm text-muted-foreground">Loading LiveMint articles…</div>}
        {!lmLoading && lmFiltered.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No LiveMint articles stored yet — use Refresh Now to pull the latest.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {lmFiltered.slice(0, 24).map((a) => (
            <article
              key={a.id}
              className="glass rounded-xl p-4 border border-border hover:border-primary/40 transition flex flex-col"
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                <span className="text-primary">LiveMint</span>
                {a.category && <span>· {a.category}</span>}
                {a.severity && (
                  <span className={`ml-auto px-1.5 rounded border ${sevColor[a.severity] ?? ""}`}>
                    {a.severity}
                  </span>
                )}
              </div>
              <div className="font-medium text-sm leading-snug">{a.title}</div>
              {a.ai_summary ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                    <Sparkles className="h-3 w-3" /> AI summary
                  </span>
                  <p className="mt-1">{a.ai_summary}</p>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-2 line-clamp-3">{a.snippet}</div>
              )}
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {a.published_at ? new Date(a.published_at).toLocaleString() : "—"}
                </span>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Read Original <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* AI & Emerging Tech */}
      <section>
        <h2 className="text-lg font-semibold mb-3">AI & Emerging Technology</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(data?.ai ?? []).slice(0, 6).map((a) => (
            <a
              key={a.id}
              href={a.link}
              target="_blank"
              rel="noreferrer"
              className="glass rounded-xl p-4 border border-border hover:border-primary/40 transition"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{a.source}</div>
              <div className="font-medium text-sm">{a.title}</div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.snippet}</div>
            </a>
          ))}
          {(data?.ai ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">No AI feed items right now.</div>
          )}
        </div>
      </section>

      {/* CVE Table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Latest CVEs (last 7 days)</h2>
          <div className="flex gap-1">
            {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
              <button
                key={s}
                onClick={() => setCveSeverity(s)}
                className={`text-[11px] px-2 py-1 rounded border ${cveSeverity === s ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="glass rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">CVE</th>
                <th className="text-left px-3 py-2">CVSS</th>
                <th className="text-left px-3 py-2">Severity</th>
                <th className="text-left px-3 py-2">Vendor</th>
                <th className="text-left px-3 py-2">Product</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Description</th>
                <th className="text-left px-3 py-2">Published</th>
              </tr>
            </thead>
            <tbody>
              {filteredCves.slice(0, 25).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <a
                      className="text-primary hover:underline"
                      href={`https://nvd.nist.gov/vuln/detail/${c.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.id}
                    </a>
                  </td>
                  <td className="px-3 py-2">{c.cvss?.toFixed(1) ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={sevColor[c.severity.toLowerCase()] ?? ""}>
                      {c.severity}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{c.vendor}</td>
                  <td className="px-3 py-2">{c.product}</td>
                  <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground line-clamp-1 max-w-xl">{c.description}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(c.published).toLocaleDateString()}</td>
                </tr>
              ))}
              {filteredCves.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No CVEs match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Data Breach Scanner */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-5 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Data Breach Checker</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Check whether your email address or phone number has appeared in a known data breach.
            Kaalu links you to the trusted, official source — <span className="text-foreground">Have I Been Pwned</span>,
            operated by security researcher Troy Hunt.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5 mb-5 list-disc pl-4">
            <li>Search by email address or phone number</li>
            <li>See every known breach and paste your data appeared in</li>
            <li>Subscribe to notifications for future breaches</li>
          </ul>
          <a
            href="https://haveibeenpwned.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition"
          >
            Open Have I Been Pwned <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Opens in a new tab. Kaalu never stores or transmits your email during this check.
          </div>
        </div>

        <div className="glass rounded-xl p-5 border border-border">
          <h2 className="text-lg font-semibold mb-1">Security Reminders</h2>
          <p className="text-xs text-muted-foreground mb-3">Track patch reviews, audits, and compliance tasks. (Stored locally on this device.)</p>
          <SecurityReminders />
        </div>
      </section>


      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: "red" | "orange";
}) {
  const ring = accent === "red" ? "border-red-500/30" : accent === "orange" ? "border-orange-500/30" : "border-border";
  return (
    <div className={`glass rounded-xl p-3 border ${ring}`}>
      <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase tracking-widest">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

type Reminder = { id: string; title: string; due?: string; done: boolean };

function SecurityReminders() {
  const [items, setItems] = useState<Reminder[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("kaalu-reminders") || "[]");
    } catch {
      return [];
    }
  });
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  function save(next: Reminder[]) {
    setItems(next);
    if (typeof window !== "undefined") localStorage.setItem("kaalu-reminders", JSON.stringify(next));
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task, e.g. Review Patch Tuesday" className="bg-muted/50 border-border" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="bg-muted/50 border-border w-40" />
        <Button
          size="sm"
          onClick={() => {
            if (!title.trim()) return;
            save([{ id: crypto.randomUUID(), title: title.trim(), due, done: false }, ...items]);
            setTitle("");
            setDue("");
          }}
        >Add</Button>
      </div>
      <ul className="space-y-1.5 max-h-60 overflow-auto">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={r.done}
              onChange={() => save(items.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)))}
            />
            <span className={r.done ? "line-through text-muted-foreground" : ""}>{r.title}</span>
            {r.due && <span className="text-xs text-muted-foreground ml-auto">{r.due}</span>}
            <button className="text-muted-foreground hover:text-destructive text-xs" onClick={() => save(items.filter((x) => x.id !== r.id))}>×</button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted-foreground">No reminders yet.</li>}
      </ul>
    </div>
  );
}