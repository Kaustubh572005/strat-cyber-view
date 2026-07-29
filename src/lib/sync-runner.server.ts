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

async function fetchHtml(
  url: string,
  referer?: string,
  init?: { method?: string; body?: string; extraHeaders?: Record<string, string>; timeoutMs?: number },
): Promise<string | null> {
  const timeout = init?.timeoutMs ?? 20000;
  const method = init?.method ?? "GET";
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(referer ? { Referer: referer } : {}),
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" }
          : {}),
        ...(init?.extraHeaders ?? {}),
      },
      body: init?.body,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      console.warn("[sync] fetch non-ok", res.status, url);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn("[sync] fetch fail", url, (e as Error).message);
    return null;
  }
}

// ---------------- Official SEBI Legal Repository ----------------
//
// Source of truth: https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=<n>&smid=0
//   ssid=7 → Circulars, ssid=5 → Guidelines, ssid=3 → Regulations
// "Advisory" documents are published inside the same legal repository (they
// carry "Advisory" in the official title), so they are tagged from the same
// official rows. No RSS, no Google News, no third-party sources.

export const SEBI_DOC_TYPES = ["Circulars", "Guidelines", "Advisory", "Regulations"] as const;
export type SebiDocType = (typeof SEBI_DOC_TYPES)[number];

const SEBI_SECTIONS: Array<{ ssid: number; type: SebiDocType }> = [
  { ssid: 7, type: "Circulars" },
  { ssid: 5, type: "Guidelines" },
  { ssid: 3, type: "Regulations" },
];

function sebiDocId(url: string): string {
  const m = /_(\d{3,})\.html?$/i.exec(url);
  return m ? `sebi-${m[1]}` : hash(`sebi:${url}`);
}

// Parse a SEBI legal listing table (full page or AJAX fragment).
// Rows are: <td>date</td><td><a href=...>title</a></td>
function parseSebiListing(html: string, docType: SebiDocType): NormalizedItem[] {
  const items: NormalizedItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(html)) !== null) {
    const row = r[1];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tds.length < 2) continue;
    const dateText = stripHtml(tds[0][1]);
    const dm = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/i.exec(dateText);
    if (!dm) continue;
    const linkCell = tds[tds.length - 1][1];
    const a = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(linkCell);
    if (!a) continue;
    const href = a[1].replace(/&amp;/g, "&");
    const title = stripHtml(a[2]).slice(0, 500);
    if (!title || title.length < 6) continue;
    const url = href.startsWith("http")
      ? href
      : `https://www.sebi.gov.in${href.startsWith("/") ? "" : "/"}${href}`;
    if (!/sebi\.gov\.in/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const d = new Date(`${dm[1]} ${dm[2]} ${dm[3]}`);
    const published_at = isNaN(d.getTime()) ? null : d.toISOString();
    // Official type comes from the listing section. Advisory documents live
    // inside the same legal listing and are identified by their official title.
    const category: SebiDocType = /\badvisor(y|ies)\b/i.test(title) ? "Advisory" : docType;
    const numMatch = /(SEBI\/HO\/[A-Z0-9_\-/]+\/\d{4}\/\d+|CIR\/[A-Z0-9_\-/]+\/\d+)/i.exec(title);
    items.push({
      external_id: sebiDocId(url),
      title,
      url,
      publisher: "SEBI",
      category,
      published_at,
      snippet: numMatch ? `${category.replace(/s$/, "")} No. ${numMatch[1]}` : null,
      attachment_url: url.toLowerCase().endsWith(".pdf") ? url : null,
      raw: { doc_type: category, listing_type: docType, topic: classifySebi(title) },
    });
  }
  return items;
}

async function scrapeSebiSection(ssid: number, type: SebiDocType): Promise<NormalizedItem[]> {
  const out: NormalizedItem[] = [];
  const seen = new Set<string>();
  const listingUrl = `https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=${ssid}&smid=0`;
  const first = await fetchHtml(listingUrl, "https://www.sebi.gov.in/", { timeoutMs: 30000 });
  if (first) {
    for (const it of parseSebiListing(first, type)) {
      if (!seen.has(it.url)) {
        seen.add(it.url);
        out.push(it);
      }
    }
  }

  const ajaxUrl = "https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp";
  const MAX_PAGES = 40; // ~1000 records per type; safety cap
  for (let nextValue = 2; nextValue <= MAX_PAGES; nextValue++) {
    const body =
      `nextValue=${nextValue}&next=n&search=&fromDate=&toDate=&fromYear=&toYear=` +
      `&deptId=&sid=1&ssid=${ssid}&smid=0&ssidhidden=${ssid}&intmid=-1` +
      `&sText=Legal&ssText=${encodeURIComponent(type)}&smText=&doDirect=1`;
    const frag = await fetchHtml(ajaxUrl, listingUrl, { method: "POST", body, timeoutMs: 25000 });
    if (!frag) break;
    const parsed = parseSebiListing(frag, type);
    let fresh = 0;
    for (const it of parsed) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      out.push(it);
      fresh++;
    }
    if (fresh === 0) break; // end of listing
  }
  console.log(`[sync sebi] ${type}: ${out.length} records`);
  return out;
}

async function scrapeSebi(): Promise<NormalizedItem[]> {
  const all: NormalizedItem[] = [];
  for (const s of SEBI_SECTIONS) {
    try {
      all.push(...(await scrapeSebiSection(s.ssid, s.type)));
    } catch (e) {
      console.warn("[sync sebi] section failed", s.type, (e as Error).message);
    }
  }
  const map = new Map<string, NormalizedItem>();
  for (const it of all) if (!map.has(it.external_id)) map.set(it.external_id, it);
  return Array.from(map.values());
}

// Enrich freshly stored SEBI documents with the official PDF link, the
// circular/document number and a short AI summary. Bounded so a sync never
// stalls on a large backfill; un-enriched rows still display fine.
async function enrichSebiRows(
  supa: ReturnType<typeof adminClient>,
  rows: Array<{ id: string; title: string; url: string; category: string | null }>,
) {
  const targets = rows.slice(0, 30);
  for (const row of targets) {
    try {
      const patch: { attachment_url?: string; snippet?: string; ai_summary?: string } = {};
      if (/\.html?$/i.test(row.url)) {
        const html = await fetchHtml(row.url, "https://www.sebi.gov.in/", { timeoutMs: 20000 });
        if (html) {
          const pdf = /sebi_data\/attachdocs\/[^"'?<>\s]+\.pdf/i.exec(html);
          if (pdf) patch.attachment_url = `https://www.sebi.gov.in/${pdf[0]}`;
          const num = /(?:Circular|Notification|Guideline)\s*No\.?:?\s*<\/span>\s*<span>([^<]+)</i.exec(html);
          if (num) patch.snippet = `${row.category ?? "Document"} No. ${stripHtml(num[1])}`;
        }
      }
      const summary = await summarizeSebi(row.title, row.category);
      if (summary) patch.ai_summary = summary;
      if (Object.keys(patch).length > 0) {
        await supa.from("feed_articles").update(patch).eq("id", row.id);
      }
    } catch (e) {
      console.warn("[sync sebi] enrich failed", row.url, (e as Error).message);
    }
  }
}

async function summarizeSebi(title: string, category: string | null): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
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
              "You summarise Indian securities-market regulation. Reply with ONE plain sentence (max 30 words) describing what this SEBI document does and who it applies to. No preamble.",
          },
          { role: "user", content: `SEBI ${category ?? "document"}: ${title}` },
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
    } else {
      // fall back to year from advisory id (CIVN-2026-1234)
      const yearM = /CI(?:VN|AD)-(\d{4})-/.exec(advId);
      if (yearM) published_at = new Date(`${yearM[1]}-01-01T00:00:00Z`).toISOString();
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
  // Always include 2026 explicitly plus current & recent years; some
  // deployments were missing 2026 items because the year loop silently
  // dropped fetches that timed out. We now retry each year once and
  // extend the per-fetch timeout.
  const currentYear = new Date().getUTCFullYear();
  const years = Array.from(new Set([2026, currentYear, currentYear - 1, currentYear - 2])).sort(
    (a, b) => b - a,
  );
  const items: NormalizedItem[] = [];
  for (const year of years) {
    const url = `https://www.cert-in.org.in/s2cMainServlet?pageid=PUBADVLIST02&year=${year}`;
    let html = await fetchHtml(url, "https://www.cert-in.org.in/", { timeoutMs: 30000 });
    if (!html) {
      // one retry
      html = await fetchHtml(url, "https://www.cert-in.org.in/", { timeoutMs: 30000 });
    }
    if (!html) {
      console.warn("[sync cert-in] year unreachable", year);
      continue;
    }
    const parsed = parseCertInHtml(html);
    console.log(`[sync cert-in] year ${year}: ${parsed.length} items`);
    items.push(...parsed);
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
          .select("id, title, severity, url, category");
        if (error) throw error;
        added = data?.length ?? 0;
        if (data && data.length > 0) {
          if (sourceKey === "sebi-whats-new") await enrichSebiRows(supa, data);
          await supa.from("notifications").insert(
            data.slice(0, 25).map((d) => ({
              source_key: sourceKey,
              title:
                sourceKey === "sebi-whats-new" && d.category
                  ? `SEBI ${d.category}: ${d.title}`
                  : d.title,
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
