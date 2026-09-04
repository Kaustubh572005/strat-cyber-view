import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNseDisclosures, refreshSource, type NseDisclosureRow } from "@/lib/feeds.functions";
import {
  Building2,
  RefreshCw,
  ExternalLink,
  Download,
  Sparkles,
  Search as SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/nse")({
  component: NsePage,
});

function NsePage() {
  const get = useServerFn(listNseDisclosures);
  const refresh = useServerFn(refreshSource);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [incident, setIncident] = useState("ALL");
  const [year, setYear] = useState<string>("ALL");
  const [sort, setSort] = useState<"newest" | "oldest" | "company">("newest");

  const query = useQuery({
    queryKey: ["nse-disclosures"],
    queryFn: () => get({ data: { limit: 500 } }),
    refetchInterval: 6 * 60 * 60 * 1000,
    staleTime: 60_000,
  });
  const mut = useMutation({
    mutationFn: () => refresh({ data: { source_key: "nse-cyber" } }),
    onSuccess: (r) => {
      toast.success(`NSE — ${r.results[0].added} new`);
      qc.invalidateQueries({ queryKey: ["nse-disclosures"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = query.data ?? [];
  const years = useMemo(() => {
    const s = new Set<number>();
    items.forEach((i) => i.notice_datetime && s.add(new Date(i.notice_datetime).getFullYear()));
    return Array.from(s).sort((a, b) => b - a);
  }, [items]);
  const incidents = useMemo(
    () => Array.from(new Set(items.map((i) => i.incident_type).filter(Boolean))) as string[],
    [items],
  );

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    let list = items.filter((r) => {
      if (incident !== "ALL" && r.incident_type !== incident) return false;
      if (year !== "ALL" && r.notice_datetime && new Date(r.notice_datetime).getFullYear() !== Number(year))
        return false;
      if (!s) return true;
      return (
        (r.company_name ?? "").toLowerCase().includes(s) ||
        (r.symbol ?? "").toLowerCase().includes(s) ||
        (r.subject ?? "").toLowerCase().includes(s) ||
        (r.details ?? "").toLowerCase().includes(s)
      );
    });
    if (sort === "oldest") list = [...list].reverse();
    else if (sort === "company")
      list = [...list].sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? ""));
    return list;
  }, [items, q, incident, year, sort]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">NSE</div>
          <h1 className="text-3xl font-semibold neon-text mt-1">NSE Cybersecurity Notices</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Permanent repository of cybersecurity, information security, ransomware, and unauthorized-access
            disclosures filed on the NSE. Non-cybersecurity General Updates (financials, dividends, corporate actions)
            are excluded. Sourced from{" "}
            <a
              href="https://www.nseindia.com/companies-listing/corporate-filings-announcements"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              nseindia.com
            </a>
            .
          </p>
        </div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="inline-flex items-center gap-2 border border-primary/30 rounded-full px-4 py-2 text-sm text-primary hover:bg-primary/10"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${mut.isPending ? "animate-spin" : ""}`} />
          {mut.isPending ? "Refreshing…" : "Refresh now"}
        </button>
      </header>

      <section className="glass rounded-xl p-4 border border-border flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company / symbol / subject…"
            className="h-9 pl-8 text-sm bg-muted/50 border-border"
          />
        </div>
        <select
          value={incident}
          onChange={(e) => setIncident(e.target.value)}
          className="h-9 rounded-md bg-muted/50 border border-border px-2 text-sm"
        >
          <option value="ALL">All incident types</option>
          {incidents.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="h-9 rounded-md bg-muted/50 border border-border px-2 text-sm"
        >
          <option value="ALL">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="h-9 rounded-md bg-muted/50 border border-border px-2 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="company">By company</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {items.length} notices
        </span>
      </section>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading repository…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 glass rounded-xl border border-border">
          No matching notices. Try clearing filters or clicking Refresh.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <NseRow key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NseRow({ row }: { row: NseDisclosureRow }) {
  return (
    <li className="glass rounded-xl p-4 border border-border hover:border-primary/40 transition">
      <div className="flex items-start gap-3 flex-wrap">
        <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {row.incident_type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/30 uppercase tracking-widest">
                {row.incident_type}
              </span>
            )}
            {row.symbol && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border uppercase tracking-widest text-muted-foreground">
                {row.symbol}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {row.notice_datetime
                ? new Date(row.notice_datetime).toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>
          <div className="text-sm font-medium">{row.company_name ?? "NSE Filing"}</div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{row.subject}</div>
          {(row.ai_summary || row.details) && (
            <div className="mt-1.5 flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-2">
                {row.ai_summary ?? row.details}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          {row.attachment_url && (
            <a
              href={row.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Download className="h-3 w-3" /> Attachment
            </a>
          )}
          {row.external_url && (
            <a
              href={row.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              NSE <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
