import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { XMLParser } from "fast-xml-parser";

const UA = "Mozilla/5.0 (compatible; KaaluAI/1.0; +https://kaalu-voice-wise-assistant.lovable.app)";

export type NormalizedItem = {
  external_id: string;
  title: string;
  url: string;
  publisher?: string | null;
  category?: string | null;
  severity?: string | null;
  published_at?: string | null;
  snippet?: string | null;
  attachment_url?: string | null;
  raw?: any;
};

export type NseItem = {
  external_id: string;
  symbol?: string | null;
  company_name?: string | null;
  subject?: string | null;
  details?: string | null;
  incident_type?: string | null;
  notice_datetime?: string | null;
  attachment_url?: string | null;
  external_url?: string | null;
  raw?: any;

};

export function adminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key, {
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
    .replace(/\s+/g, " ")
    .trim();
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

async function fetchRss(url: string): Promise<any[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
  const parsed = parser.parse(xml);
  if (parsed?.rss?.channel?.item) {
    return Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
  }
  if (parsed?.feed?.entry) {
    return Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
  }
  return [];
}

function normalizeRssItem(it: any, publisher: string): NormalizedItem | null {
  const title = stripHtml(it.title?.["#text"] ?? it.title ?? "");
  const link =
    typeof it.link === "string"
      ? it.link
      : it.link?.["@_href"] ?? it.link?.[0]?.["@_href"] ?? it.link?.["#text"] ?? "";
  if (!title || !link) return null;
  const desc = stripHtml(it.description ?? it.summary ?? it.content ?? it["content:encoded"] ?? "");
  const pub = it.pubDate ?? it.published ?? it.updated ?? null;
  const published_at = pub ? new Date(pub).toISOString() : null;
  return {
    external_id: hash(`${publisher}:${link || title}`),
    title,
    url: link,
    publisher,
    published_at,
    snippet: desc.slice(0, 800),
  };
}

// ---------------- Cyber News ----------------

const CYBER_FEEDS = [
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
  { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml" },
  { name: "SecurityWeek", url: "https://www.securityweek.com/feed/" },
  { name: "CyberScoop", url: "https://cyberscoop.com/feed/" },
  { name: "SANS ISC", url: "https://isc.sans.edu/rssfeed.xml" },
  { name: "CISA", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml" },
  { name: "Cisco Talos", url: "https://blog.talosintelligence.com/rss/" },
];

function detectSeverity(text: string): string {
  const t = text.toLowerCase();
  if (/zero[- ]day|critical|actively exploited|ransomware|emergency|rce\b/.test(t)) return "critical";
  if (/high[- ]severity|exploit|malware|phishing|vulnerab|cve-/.test(t)) return "high";
  if (/advisory|warning|alert|risk|breach/.test(t)) return "medium";
  return "info";
}

async function scrapeCyberNews(): Promise<NormalizedItem[]> {
  const results = await Promise.all(
    CYBER_FEEDS.map(async (f) => {
      try {
        const raw = await fetchRss(f.url);
        return raw.slice(0, 20).map((it) => normalizeRssItem(it, f.name)).filter((x): x is NormalizedItem => !!x);
      } catch (e) {
        console.error("[sync cyber-news]", f.name, (e as Error).message);
        return [];
      }
    }),
  );
  return results.flat().map((it) => ({ ...it, severity: detectSeverity(`${it.title} ${it.snippet}`) }));
}

// ---------------- AI News ----------------

const AI_FEEDS = [
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/" },
  { name: "OpenAI Blog", url: "https://openai.com/blog/rss.xml" },
  { name: "MIT Tech Review AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { name: "The Verge AI", url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml" },
];

async function scrapeAiNews(): Promise<NormalizedItem[]> {
  const results = await Promise.all(
    AI_FEEDS.map(async (f) => {
      try {
        const raw = await fetchRss(f.url);
        return raw.slice(0, 15).map((it) => normalizeRssItem(it, f.name)).filter((x): x is NormalizedItem => !!x);
      } catch (e) {
        console.error("[sync ai-news]", f.name, (e as Error).message);
        return [];
      }
    }),
  );
  return results.flat();
}

// ---------------- SEBI Circular Repository (official only) ----------------
//
// Source of truth: https://www.sebi.gov.in/  (Legal → Circulars listing)
// Rule: ONLY records whose Type = "Circulars" are stored. No RSS, no Google
// News, no third-party feeds. If the official listing is unreachable we
// return [] and let the caller surface "Official source temporarily
// unavailable." — we never silently substitute other content.

function classifySebi(title: string): string {
  const t = title.toLowerCase();
  if (/cyber|security|vapt|resilien/i.test(t)) return "Cybersecurity";
  if (/mutual\s?fund|mf\b/i.test(t)) return "Mutual Funds";
  if (/broker|stock\s?broker|trading\s?member/i.test(t)) return "Brokers";
  if (/depositor|depository|dp\b/i.test(t)) return "Depositories";
  if (/exchange|stock\s?exchange|mii/i.test(t)) return "Market Infrastructure";
  if (/compliance|listing|disclosure|lodr/i.test(t)) return "Compliance";
  return "General";
}

async function fetchHtml(url: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.warn("[sync] fetch fail", url, (e as Error).message);
    return null;
  }
}

// Parse SEBI Circulars listing HTML. Only anchors that point to canonical
// SEBI circular paths are accepted — this is the SEBI "Type = Circulars"
// filter enforced at parse time.
function parseSebiCirculars(html: string): NormalizedItem[] {
  const items: NormalizedItem[] = [];
  const seen = new Set<string>();
  const anchorRe =
    /<a[^>]+href="((?:\/sebi_data\/attachdocs|\/legal\/circulars|\/web\/[^"]*circular)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const title = stripHtml(m[2]).slice(0, 400);
    if (!title || title.length < 8) continue;
    const url = href.startsWith("http") ? href : `https://www.sebi.gov.in${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const tail = html.slice(m.index, m.index + 500);
    const dateMatch =
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(\d{4})/i.exec(tail);
    let published_at: string | null = null;
    if (dateMatch) {
      const d = new Date(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`);
      if (!isNaN(d.getTime())) published_at = d.toISOString();
    }
    const numMatch = /(SEBI\/HO\/[A-Z0-9_\-/]+\/\d{4}\/\d+|CIR\/[A-Z0-9_\-/]+\/\d+)/i.exec(
      `${title} ${tail}`,
    );
    items.push({
      external_id: hash(`sebi:${url}`),
      title,
      url,
      publisher: "SEBI",
      category: classifySebi(title),
      published_at,
      snippet: numMatch ? `Circular No. ${numMatch[1]}` : null,
      attachment_url: url.toLowerCase().endsWith(".pdf") ? url : null,
    });
  }
  return items;
}

async function scrapeSebi(): Promise<NormalizedItem[]> {
  // Official SEBI Circulars listing. sid=1 (Legal) ssid=6 (Circulars).
  const listingUrls = [
    "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=6&smid=0",
    "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=6&smid=0&page=2",
    "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=6&smid=0&page=3",
  ];
  const all: NormalizedItem[] = [];
  for (const url of listingUrls) {
    const html = await fetchHtml(url, "https://www.sebi.gov.in/");
    if (!html) continue;
    all.push(...parseSebiCirculars(html));
  }
  const map = new Map<string, NormalizedItem>();
  for (const it of all) if (!map.has(it.url)) map.set(it.url, it);
  return Array.from(map.values());
}

// ---------------- CERT-In Advisory Repository (official only) ----------------
//
// Source of truth: https://www.cert-in.org.in/
// Flow: Advisories → Advisories of the Year → <year>
//   https://www.cert-in.org.in/s2cMainServlet?pageid=PUBADVLIST02&year=<year>
// Rule: ONLY the official CERT-In advisory listing. No RSS, no Google News,
// no third-party sources.

function parseCertInHtml(html: string): NormalizedItem[] {
  const items: NormalizedItem[] = [];
  const seen = new Set<string>();
  const anchorRe =
    /<a[^>]+href="([^"]*VLCODE=(CI(?:VN|AD)-\d{4}-\d{4,5}))[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const hrefRaw = m[1].replace(/&amp;/g, "&");
    const advId = m[2];
    if (seen.has(advId)) continue;
    seen.add(advId);
    const title = stripHtml(m[3]).slice(0, 400);
    const url = hrefRaw.startsWith("http")
      ? hrefRaw
      : `https://www.cert-in.org.in/${hrefRaw.replace(/^\//, "")}`;
    if (!title) continue;
    const tail = html.slice(m.index, m.index + 600);
    const dateMatch =
      /(\d{1,2})[-\s/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s/](\d{4})/i.exec(
        tail,
      );
    let published_at: string | null = null;
    if (dateMatch) {
      const d = new Date(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`);
      if (!isNaN(d.getTime())) published_at = d.toISOString();
    }
    items.push({
      external_id: advId,
      title: `${advId}: ${title}`,
      url,
      publisher: "CERT-In",
      category: advId.startsWith("CIAD") ? "Advisory" : "Vulnerability Note",
      severity: detectSeverity(title),
      snippet: title,
      published_at,
    });
  }
  return items;
}

async function scrapeCertIn(): Promise<NormalizedItem[]> {
  const currentYear = new Date().getUTCFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const items: NormalizedItem[] = [];
  for (const year of years) {
    const url = `https://www.cert-in.org.in/s2cMainServlet?pageid=PUBADVLIST02&year=${year}`;
    const html = await fetchHtml(url, "https://www.cert-in.org.in/");
    if (!html) continue;
    items.push(...parseCertInHtml(html));
  }
  const map = new Map<string, NormalizedItem>();
  for (const it of items) if (!map.has(it.external_id)) map.set(it.external_id, it);
  return Array.from(map.values());
}

// ---------------- UTI AMC Cyber Watch ----------------

const UTI_QUERY = encodeURIComponent(
  '"UTI Asset Management" OR "UTI AMC" OR "UTI Mutual Fund" (cybersecurity OR "cyber attack" OR "cyber incident" OR "data breach" OR vulnerability OR "CERT-In" OR ransomware OR malware OR phishing OR "security incident" OR "information security" OR "security advisory" OR "threat intelligence")',
);

function classifyUtiIncident(text: string): string {
  const t = text.toLowerCase();
  if (/data breach|breach|leak/.test(t)) return "Data Breach";
  if (/vulnerab|cve-|patch|zero[- ]day/.test(t)) return "Vulnerability";
  if (/advisory|alert|warning/.test(t)) return "Advisory";
  if (/regulator|sebi|disclosure|circular/.test(t)) return "Regulatory Disclosure";
  if (/threat intelligence|apt|attribution|threat actor/.test(t)) return "Threat Intelligence";
  return "News";
}

async function scrapeUtiAmcCyber(): Promise<NormalizedItem[]> {
  try {
    const raw = await fetchRss(
      `https://news.google.com/rss/search?q=${UTI_QUERY}&hl=en-IN&gl=IN&ceid=IN:en`,
    );
    return raw
      .slice(0, 100)
      .map((it) => normalizeRssItem(it, "News"))
      .filter((x): x is NormalizedItem => !!x)
      .filter((it) => /uti/i.test(`${it.title} ${it.snippet ?? ""}`))
      .map((it) => ({
        ...it,
        severity: detectSeverity(`${it.title} ${it.snippet}`),
        category: classifyUtiIncident(`${it.title} ${it.snippet}`),
      }));
  } catch (e) {
    console.error("[sync uti-amc-cyber] fail", (e as Error).message);
    return [];
  }
}

// ---------------- NSE Cybersecurity ----------------

const NSE_CYBER_RE =
  /cyber[- ]?security|cyber[- ]?attack|cyber[- ]?incident|information security|infosec|data breach|ransomware|malware|unauthorized access|phishing|hacking|technology (security|incident)|it (security|incident)|security incident|breach of data|cyber event/i;

async function scrapeNseCyber(): Promise<NseItem[]> {
  const commonHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  };
  // Prime cookies
  let cookieHeader = "";
  try {
    const primer = await fetch("https://www.nseindia.com/", {
      headers: {
        "User-Agent": commonHeaders["User-Agent"],
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(9000),
    });
    const setCookie = primer.headers.get("set-cookie") || "";
    cookieHeader = setCookie
      .split(/,(?=[^ ;]+=)/)
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
  } catch (e) {
    console.warn("[sync nse-cyber] cookie prime failed", (e as Error).message);
  }

  const urls = [
    "https://www.nseindia.com/api/corporate-announcements?index=equities&subject=General%20Updates",
    "https://www.nseindia.com/api/corporate-announcements?index=equities&subject=Announcement%20under%20Regulation%2030%20(LODR)-Cyber%20Security%20Incidents/Breaches",
  ];
  const all: any[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { ...commonHeaders, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.warn("[sync nse-cyber]", res.status, url);
        continue;
      }
      const json = (await res.json()) as any;
      const arr = Array.isArray(json) ? json : json?.data ?? [];
      all.push(...arr);
    } catch (e) {
      console.warn("[sync nse-cyber] fetch fail", (e as Error).message);
    }
  }

  const items: NseItem[] = [];
  for (const row of all) {
    const subject = String(row.subject ?? row.desc ?? "").trim();
    const details = String(row.attchmntText ?? row.attchmntFile ?? row.smIndustry ?? "").trim();
    const combined = `${subject} ${details}`;
    // Filter for cyber-related
    if (!NSE_CYBER_RE.test(combined)) continue;
    const symbol = String(row.symbol ?? "").trim() || null;
    const company = String(row.sm_name ?? row.smName ?? row.companyName ?? "").trim() || null;
    const attachment = row.attchmntFile
      ? row.attchmntFile.startsWith("http")
        ? row.attchmntFile
        : `https://nsearchives.nseindia.com/${String(row.attchmntFile).replace(/^\//, "")}`
      : null;
    const noticeDatetimeRaw = row.an_dt ?? row.exchdisstime ?? row.sort_date ?? null;
    const noticeDatetime = noticeDatetimeRaw ? new Date(noticeDatetimeRaw).toISOString() : null;
    const externalId = hash(
      `nse:${symbol ?? ""}:${subject}:${noticeDatetimeRaw ?? ""}:${attachment ?? ""}`,
    );
    items.push({
      external_id: externalId,
      symbol,
      company_name: company,
      subject,
      details,
      incident_type: classifyIncident(combined),
      notice_datetime: noticeDatetime,
      attachment_url: attachment,
      external_url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
      raw: row,
    });
  }
  return items;
}

function classifyIncident(text: string): string {
  const t = text.toLowerCase();
  if (/ransomware/.test(t)) return "Ransomware";
  if (/data breach|leaked|leak/.test(t)) return "Data Breach";
  if (/phishing/.test(t)) return "Phishing";
  if (/malware/.test(t)) return "Malware";
  if (/unauthorized/.test(t)) return "Unauthorized Access";
  if (/incident|breach/.test(t)) return "Security Incident";
  return "Cybersecurity Disclosure";
}

// ---------------- Runner ----------------

export type SourceKey =
  | "sebi-whats-new"
  | "cert-in"
  | "nse-cyber"
  | "cyber-news"
  | "ai-news"
  | "uti-amc-cyber";

export async function runSync(sourceKey: SourceKey): Promise<{ added: number; total: number }> {
  const supa = adminClient();
  const run = await supa
    .from("sync_runs")
    .insert({ source_key: sourceKey, status: "running" })
    .select("id")
    .single();
  const runId = run.data?.id;

  try {
    let added = 0;
    let total = 0;
    if (sourceKey === "nse-cyber") {
      const items = await scrapeNseCyber();
      total = items.length;
      if (items.length > 0) {
        const { data, error } = await supa
          .from("nse_disclosures")
          .upsert(items, { onConflict: "external_id", ignoreDuplicates: true })
          .select("id, external_id, subject, company_name, notice_datetime");
        if (error) throw error;
        added = data?.length ?? 0;
        // Notifications for newly added rows
        if (data && data.length > 0) {
          await supa.from("notifications").insert(
            data.map((d) => ({
              source_key: sourceKey,
              title: `${d.company_name ?? "NSE"} — ${d.subject ?? "Cybersecurity notice"}`,
              body: null,
              link: "/nse",
              article_id: d.id,
              severity: null,
            })),
          );
        }
      }
    } else {
      let items: NormalizedItem[] = [];
      if (sourceKey === "sebi-whats-new") items = await scrapeSebi();
      else if (sourceKey === "cert-in") items = await scrapeCertIn();
      else if (sourceKey === "cyber-news") items = await scrapeCyberNews();
      else if (sourceKey === "ai-news") items = await scrapeAiNews();
      else if (sourceKey === "uti-amc-cyber") items = await scrapeUtiAmcCyber();
      total = items.length;

      // Batch upsert with dedup
      if (items.length > 0) {
        const rows = items.map((it) => ({
          source_key: sourceKey,
          external_id: it.external_id,
          title: it.title,
          url: it.url,
          publisher: it.publisher ?? null,
          category: it.category ?? null,
          severity: it.severity ?? null,
          published_at: it.published_at ?? null,
          snippet: it.snippet ?? null,
          attachment_url: it.attachment_url ?? null,
          raw: (it.raw ?? null) as any,
        }));
        const { data, error } = await supa
          .from("feed_articles")
          .upsert(rows, { onConflict: "source_key,external_id", ignoreDuplicates: true })
          .select("id, title, severity, url");
        if (error) throw error;
        added = data?.length ?? 0;
        if (data && data.length > 0) {
          await supa.from("notifications").insert(
            data.slice(0, 25).map((d) => ({
              source_key: sourceKey,
              title: d.title,
              body: null,
              link: d.url,
              article_id: d.id,
              severity: d.severity,
            })),
          );
        }
      }
    }

    await supa
      .from("feed_sources")
      .update({
        last_synced_at: new Date().toISOString(),
        last_status: "ok",
        last_error: null,
        last_added_count: added,
        updated_at: new Date().toISOString(),
      })
      .eq("source_key", sourceKey);
    if (runId) {
      await supa
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), status: "ok", added_count: added })
        .eq("id", runId);
    }
    return { added, total };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[runSync]", sourceKey, msg);
    await supa
      .from("feed_sources")
      .update({
        last_synced_at: new Date().toISOString(),
        last_status: "error",
        last_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("source_key", sourceKey);
    if (runId) {
      await supa
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), status: "error", error: msg })
        .eq("id", runId);
    }
    throw e;
  }
}
