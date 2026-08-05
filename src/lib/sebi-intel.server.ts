// ---------------- SEBI Intelligence: Public Issues + Orders ----------------
//
// Independent of the existing SEBI Legal module (feed_articles / sync-runner).
// Source of truth: official SEBI listings only.
//   Public Issues → HomeAction.do?doListing=yes&sid=3&ssid=15&smid=<10|11|12|78>
//   Orders        → HomeAction.do?doListing=yes&sid=2&ssid=9&smid=<...>
// Pagination goes through the official AJAX listing endpoint. Records are
// append-only: existing rows are never deleted on refresh.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AJAX_URL = "https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp";

export type PublicIssueType =
  | "Draft Offer Documents"
  | "Red Herring Documents"
  | "Final Offer Documents"
  | "Other Documents";

export type OrderCategory =
  | "Orders of SAT"
  | "Orders of Chairperson / Members"
  | "Settlement Orders"
  | "Orders under RTI Act"
  | "Orders of Corporatisation / Demutualisation Scheme"
  | "Orders of AO"
  | "Orders of Courts"
  | "Orders of Special Courts"
  | "Orders of ED / CGM"
  | "Orders under Regulation 30A";

export const PUBLIC_ISSUE_SECTIONS: Array<{ smid: number; type: PublicIssueType }> = [
  { smid: 10, type: "Draft Offer Documents" },
  { smid: 11, type: "Red Herring Documents" },
  { smid: 12, type: "Final Offer Documents" },
  { smid: 78, type: "Other Documents" },
];

export const ORDER_SECTIONS: Array<{ smid: number; category: OrderCategory }> = [
  { smid: 1, category: "Orders of SAT" },
  { smid: 2, category: "Orders of Chairperson / Members" },
  { smid: 3, category: "Settlement Orders" },
  { smid: 4, category: "Orders under RTI Act" },
  { smid: 5, category: "Orders of Corporatisation / Demutualisation Scheme" },
  { smid: 6, category: "Orders of AO" },
  { smid: 7, category: "Orders of Courts" },
  { smid: 77, category: "Orders of Special Courts" },
  { smid: 133, category: "Orders of ED / CGM" },
  { smid: 138, category: "Orders under Regulation 30A" },
];

export function sebiIntelAdmin() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function stripHtml(s: string) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function absolute(href: string) {
  const u = href.replace(/&amp;/g, "&").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `https://www.sebi.gov.in${u.startsWith("/") ? "" : "/"}${u}`;
}

async function fetchListing(body: string, referer: string): Promise<string | null> {
  try {
    const res = await fetch(AJAX_URL, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: referer,
      },
      body,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn("[sebi-intel] listing non-ok", res.status);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn("[sebi-intel] listing fail", (e as Error).message);
    return null;
  }
}

export type ParsedRow = {
  external_id: string;
  title: string;
  url: string;
  pdf_url: string | null;
  date: string | null;
  extra_docs: Array<{ label: string; url: string }>;
};

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

function docId(url: string) {
  const m = /_(\d{3,})\.html?$/i.exec(url);
  return m ? `sebi-${m[1]}` : hash(url);
}

// Rows look like: <tr><td>Aug 03, 2026</td><td><a href='...' title="Title<br><a href='...pdf'>Label</a>">…</a></tr>
export function parseSebiIntelListing(html: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr[^>]*>([\s\S]*?)(?=<tr[^>]*>|<\/tbody>|<\/table>)/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(html)) !== null) {
    const row = r[1];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)(?=<td[^>]*>|<\/tr>|$)/gi)];
    if (tds.length < 2) continue;
    const dateText = stripHtml(tds[0][1]);
    const dm = new RegExp(`^(${MONTHS})\\s+(\\d{1,2}),\\s+(\\d{4})$`, "i").exec(dateText);
    if (!dm) continue;
    const cell = tds[tds.length - 1][1];
    const first = /<a[^>]+href\s*=\s*["']([^"']+)["']/i.exec(cell);
    if (!first) continue;
    const url = absolute(first[1]);
    if (!/sebi\.gov\.in/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const titleAttr = /title\s*=\s*"([^"]*)"/i.exec(cell);
    const rawTitle = titleAttr ? titleAttr[1] : cell;
    const title = stripHtml(rawTitle.split(/<br\s*\/?>/i)[0]).slice(0, 500);
    if (!title || title.length < 4) continue;

    const docs: Array<{ label: string; url: string }> = [];
    const nested = [...rawTitle.matchAll(/<a[^>]+href\s*=\s*['"]?([^'"\s>]+)['"]?[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const n of nested) {
      const nurl = absolute(n[1]);
      const label = stripHtml(n[2]).slice(0, 200) || "Document";
      if (/sebi\.gov\.in/i.test(nurl)) docs.push({ label, url: nurl });
    }
    const pdf =
      docs.find((d) => /\.pdf(\?|$)/i.test(d.url))?.url ??
      (/\.pdf(\?|$)/i.test(url) ? url : null);

    const d = new Date(`${dm[1]} ${dm[2]}, ${dm[3]} 00:00:00 UTC`);
    out.push({
      external_id: docId(url),
      title,
      url,
      pdf_url: pdf,
      date: isNaN(d.getTime()) ? null : d.toISOString(),
      extra_docs: docs,
    });
  }
  return out;
}

function companyFromTitle(title: string): string | null {
  const t = title.replace(/\s+/g, " ").trim();
  const m = /^(.*?)\s+[-–—]\s+/.exec(t);
  const name = (m ? m[1] : t).replace(/\s*\(.*?\)\s*$/, "").trim();
  return name ? name.slice(0, 250) : null;
}

async function scrapeSection(opts: {
  sid: number;
  ssid: number;
  smid: number;
  sText: string;
  ssText: string;
  smText: string;
  existing: Set<string>;
  maxPages: number;
}): Promise<ParsedRow[]> {
  const referer = `https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=${opts.sid}&ssid=${opts.ssid}&smid=${opts.smid}`;
  const out: ParsedRow[] = [];
  const seen = new Set<string>();
  let emptyStreak = 0;
  for (let page = 0; page < opts.maxPages; page++) {
    const body =
      `nextValue=${page}&next=n&search=&fromDate=&toDate=&fromYear=&toYear=` +
      `&deptId=-1&sid=${opts.sid}&ssid=${opts.ssid}&smid=${opts.smid}` +
      `&ssidhidden=${opts.ssid}&smidhidden=${opts.smid}&intmid=-1` +
      `&sText=${encodeURIComponent(opts.sText)}&ssText=${encodeURIComponent(opts.ssText)}` +
      `&smText=${encodeURIComponent(opts.smText)}&doDirect=${page}`;
    const frag = await fetchListing(body, referer);
    if (!frag) break;
    const rows = parseSebiIntelListing(frag);
    if (rows.length === 0) break;
    let freshToRun = 0;
    let freshToDb = 0;
    for (const row of rows) {
      if (seen.has(row.external_id)) continue;
      seen.add(row.external_id);
      freshToRun++;
      if (!opts.existing.has(row.external_id)) freshToDb++;
      out.push(row);
    }
    if (freshToRun === 0) break;
    // Deep history already indexed: stop after two fully-known pages.
    if (freshToDb === 0) {
      emptyStreak++;
      if (emptyStreak >= 2) break;
    } else {
      emptyStreak = 0;
    }
  }
  return out;
}

async function summarize(prompt: string): Promise<string | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You summarise official SEBI filings and orders for Indian capital-market professionals. Reply with ONE plain sentence (max 30 words). No preamble.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim().slice(0, 400) : null;
  } catch {
    return null;
  }
}

async function markSync(
  supa: ReturnType<typeof sebiIntelAdmin>,
  repo: string,
  patch: { last_status: string; last_error?: string | null; last_added_count?: number },
) {
  await supa
    .from("sebi_repo_sync")
    .update({
      last_synced_at: new Date().toISOString(),
      last_status: patch.last_status,
      last_error: patch.last_error ?? null,
      last_added_count: patch.last_added_count ?? 0,
    })
    .eq("repo_key", repo);
}

async function notify(
  supa: ReturnType<typeof sebiIntelAdmin>,
  rows: Array<{ source_key: string; title: string; body: string | null; link: string }>,
) {
  if (rows.length === 0) return;
  await supa.from("notifications").insert(rows.slice(0, 25).map((r) => ({ ...r, severity: "info" })));
}

export type SebiIntelRepo = "public-issues" | "orders";

export async function runSebiIntelSync(
  repo: SebiIntelRepo,
  opts?: { full?: boolean },
): Promise<{ added: number; total: number }> {
  const supa = sebiIntelAdmin();
  const repoKey = repo === "public-issues" ? "sebi-public-issues" : "sebi-orders";
  const maxPages = opts?.full ? 120 : 6;
  try {
    let added = 0;
    let total = 0;

    if (repo === "public-issues") {
      const { data: existingRows } = await supa.from("sebi_public_issues").select("external_id");
      const existing = new Set((existingRows ?? []).map((r) => r.external_id));
      for (const section of PUBLIC_ISSUE_SECTIONS) {
        const rows = await scrapeSection({
          sid: 3,
          ssid: 15,
          smid: section.smid,
          sText: "Filings",
          ssText: "Public Issues",
          smText: section.type,
          existing,
          maxPages,
        });
        total += rows.length;
        const fresh = rows.filter((r) => !existing.has(r.external_id));
        if (fresh.length === 0) continue;
        const payload = fresh.map((r) => ({
          doc_type: section.type,
          external_id: r.external_id,
          company_name: companyFromTitle(r.title),
          title: r.title,
          url: r.url,
          pdf_url: r.pdf_url,
          filing_date: r.date,
          raw: { section: section.type, documents: r.extra_docs },
        }));
        const { data: inserted, error } = await supa
          .from("sebi_public_issues")
          .upsert(payload, { onConflict: "external_id", ignoreDuplicates: true })
          .select("id, title, company_name, doc_type, url");
        if (error) throw new Error(error.message);
        const ins = inserted ?? [];
        added += ins.length;
        ins.forEach((row) => existing.add(payload.find((p) => p.title === row.title)?.external_id ?? ""));
        for (const row of ins.slice(0, 20)) {
          const s = await summarize(
            `SEBI Public Issue filing (${row.doc_type}) by ${row.company_name ?? "issuer"}: ${row.title}`,
          );
          if (s) await supa.from("sebi_public_issues").update({ ai_summary: s }).eq("id", row.id);
        }
        await notify(
          supa,
          ins.slice(0, 10).map((row) => ({
            source_key: "sebi-public-issues",
            title: `New SEBI Public Issue filing: ${row.title}`.slice(0, 300),
            body: row.doc_type,
            link: row.url,
          })),
        );
      }
    } else {
      const { data: existingRows } = await supa.from("sebi_orders").select("external_id");
      const existing = new Set((existingRows ?? []).map((r) => r.external_id));
      for (const section of ORDER_SECTIONS) {
        const rows = await scrapeSection({
          sid: 2,
          ssid: 9,
          smid: section.smid,
          sText: "Enforcement",
          ssText: "Orders",
          smText: section.category,
          existing,
          maxPages,
        });
        total += rows.length;
        const fresh = rows.filter((r) => !existing.has(r.external_id));
        if (fresh.length === 0) continue;
        const payload = fresh.map((r) => ({
          category: section.category,
          external_id: r.external_id,
          title: r.title,
          url: r.url,
          pdf_url: r.pdf_url,
          order_date: r.date,
          entity_name: companyFromTitle(r.title),
          raw: { section: section.category, documents: r.extra_docs },
        }));
        const { data: inserted, error } = await supa
          .from("sebi_orders")
          .upsert(payload, { onConflict: "external_id", ignoreDuplicates: true })
          .select("id, title, category, url");
        if (error) throw new Error(error.message);
        const ins = inserted ?? [];
        added += ins.length;
        for (const p of payload) existing.add(p.external_id);
        for (const row of ins.slice(0, 20)) {
          const s = await summarize(`SEBI order (${row.category}): ${row.title}`);
          if (s) await supa.from("sebi_orders").update({ ai_summary: s }).eq("id", row.id);
        }
        await notify(
          supa,
          ins.slice(0, 10).map((row) => ({
            source_key: "sebi-orders",
            title: `New SEBI order: ${row.title}`.slice(0, 300),
            body: row.category,
            link: row.url,
          })),
        );
      }
    }

    await markSync(supa, repoKey, { last_status: "ok", last_added_count: added });
    return { added, total };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[sebi-intel]", repo, msg);
    await markSync(supa, repoKey, { last_status: "error", last_error: msg });
    throw e;
  }
}
