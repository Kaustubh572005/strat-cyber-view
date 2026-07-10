import { createServerFn } from "@tanstack/react-start";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export type CyberSource = {
  id: string;
  name: string;
  url: string;
  feed: string;
  category: "security" | "ai" | "gov";
};

export const CYBER_SOURCES: CyberSource[] = [
  { id: "thn", name: "The Hacker News", url: "https://thehackernews.com", feed: "https://feeds.feedburner.com/TheHackersNews", category: "security" },
  { id: "bleeping", name: "BleepingComputer", url: "https://www.bleepingcomputer.com", feed: "https://www.bleepingcomputer.com/feed/", category: "security" },
  { id: "krebs", name: "Krebs on Security", url: "https://krebsonsecurity.com", feed: "https://krebsonsecurity.com/feed/", category: "security" },
  { id: "darkreading", name: "Dark Reading", url: "https://www.darkreading.com", feed: "https://www.darkreading.com/rss.xml", category: "security" },
  { id: "securityweek", name: "SecurityWeek", url: "https://www.securityweek.com", feed: "https://www.securityweek.com/feed/", category: "security" },
  { id: "cyberscoop", name: "CyberScoop", url: "https://cyberscoop.com", feed: "https://cyberscoop.com/feed/", category: "security" },
  { id: "sans", name: "SANS ISC", url: "https://isc.sans.edu", feed: "https://isc.sans.edu/rssfeed.xml", category: "security" },
  { id: "cisa", name: "CISA", url: "https://www.cisa.gov", feed: "https://www.cisa.gov/cybersecurity-advisories/all.xml", category: "gov" },
  { id: "talos", name: "Cisco Talos", url: "https://blog.talosintelligence.com", feed: "https://blog.talosintelligence.com/rss/", category: "security" },
  { id: "googleai", name: "Google AI Blog", url: "https://blog.google/technology/ai/", feed: "https://blog.google/technology/ai/rss/", category: "ai" },
];

export type CyberArticle = {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceId: string;
  publishedAt: string;
  snippet: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "security" | "ai" | "gov";
  cves: string[];
  readingMinutes: number;
};

type CachedFeed = { at: number; articles: CyberArticle[] };
const feedCache = new Map<string, CachedFeed>();
const CACHE_MS = 10 * 60 * 1000;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
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

function detectSeverity(text: string): CyberArticle["severity"] {
  const t = text.toLowerCase();
  if (/(zero[- ]day|critical|actively exploited|ransomware|breach|emergency|rce\b)/.test(t)) return "critical";
  if (/(high[- ]severity|exploit|malware|phishing|vulnerab|patch tuesday|cve-)/.test(t)) return "high";
  if (/(advisory|warning|alert|risk)/.test(t)) return "medium";
  if (/(announces|releases|introduces|launches)/.test(t)) return "info";
  return "low";
}

function extractCves(text: string): string[] {
  const m = String(text || "").match(/CVE-\d{4}-\d{4,7}/gi) || [];
  return Array.from(new Set(m.map((c) => c.toUpperCase())));
}

async function fetchFeed(src: CyberSource): Promise<CyberArticle[]> {
  const cached = feedCache.get(src.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.articles;
  try {
    const res = await fetch(src.feed, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KaaluAI/1.0; +https://kaalu-voice-wise-assistant.lovable.app)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`${src.id} ${res.status}`);
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
    const parsed = parser.parse(xml);
    // Support RSS + Atom
    let items: any[] = [];
    if (parsed?.rss?.channel?.item) {
      items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
    } else if (parsed?.feed?.entry) {
      items = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
    }
    const articles: CyberArticle[] = items.slice(0, 15).map((it: any) => {
      const title = stripHtml(it.title?.["#text"] ?? it.title ?? "");
      const link =
        typeof it.link === "string"
          ? it.link
          : it.link?.["@_href"] ?? it.link?.[0]?.["@_href"] ?? it.link?.["#text"] ?? "";
      const desc = stripHtml(it.description ?? it.summary ?? it.content ?? it["content:encoded"] ?? "");
      const pub = it.pubDate ?? it.published ?? it.updated ?? new Date().toISOString();
      const publishedAt = new Date(pub).toISOString();
      const snippet = desc.slice(0, 320);
      const combined = `${title} ${desc}`;
      const id = hash(`${src.id}:${link || title}`);
      const words = desc.split(/\s+/).filter(Boolean).length || 200;
      return {
        id,
        title,
        link,
        source: src.name,
        sourceId: src.id,
        publishedAt,
        snippet,
        severity: detectSeverity(combined),
        category: src.category,
        cves: extractCves(combined),
        readingMinutes: Math.max(2, Math.round(words / 220)),
      };
    });
    feedCache.set(src.id, { at: Date.now(), articles });
    return articles;
  } catch (e) {
    console.error("[cyber] feed fail", src.id, e);
    return cached?.articles ?? [];
  }
}

export const getCyberFeed = createServerFn({ method: "GET" }).handler(async () => {
  const results = await Promise.all(CYBER_SOURCES.map((s) => fetchFeed(s).then((a) => ({ src: s, a }))));
  const all = results.flatMap((r) => r.a);
  const security = all.filter((a) => a.category !== "ai");
  const ai = all.filter((a) => a.category === "ai");
  security.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  ai.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = (iso: string) => new Date(iso).getTime() >= today.getTime();
  const todayItems = security.filter((a) => isToday(a.publishedAt));

  const kpis = {
    totalToday: todayItems.length,
    critical: security.filter((a) => a.severity === "critical").length,
    high: security.filter((a) => a.severity === "high").length,
    latestCves: Array.from(new Set(security.flatMap((a) => a.cves))).slice(0, 25).length,
    activeMalware: security.filter((a) => /malware|ransomware|trojan|backdoor|infostealer/i.test(a.title)).length,
    breaches: security.filter((a) => /breach|leaked|leak|data.*exposed/i.test(a.title)).length,
    vendors: Array.from(
      new Set(
        security
          .flatMap((a) => (a.title.match(/\b(Microsoft|Cisco|Google|Apple|Fortinet|Ivanti|VMware|Oracle|SAP|Adobe|Palo Alto|Citrix|Zoom|GitHub|GitLab|Okta|Cloudflare|AWS|Amazon)\b/gi) || []))
          .map((s) => s.toLowerCase()),
      ),
    ).length,
    countries: Array.from(
      new Set(
        security
          .flatMap((a) => (a.title.match(/\b(US|USA|China|Russia|Iran|North Korea|India|UK|Germany|France|Japan|Ukraine|Israel)\b/gi) || []))
          .map((s) => s.toUpperCase()),
      ),
    ).length,
  };

  return {
    top: security.slice(0, 10),
    ai: ai.slice(0, 8),
    all: security.slice(0, 60),
    kpis,
    updatedAt: new Date().toISOString(),
  };
});

export const getCyberArticle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const results = await Promise.all(CYBER_SOURCES.map(fetchFeed));
    const all = results.flat();
    const article = all.find((a) => a.id === data.id);
    if (!article) return null;

    const key = process.env.LOVABLE_API_KEY;
    let detail = {
      summary: article.snippet,
      risk: "See original article for full risk assessment.",
      mitigation: ["Review the vendor advisory.", "Apply available patches.", "Monitor logs for suspicious activity."],
      products: [] as string[],
      iocs: [] as string[],
      tags: [article.severity, article.category] as string[],
    };
    if (key) {
      try {
        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3.1-flash-lite");
        const { text } = await generateText({
          model,
          prompt: `You are a cyber threat intelligence analyst. Read this news snippet and produce a JSON object with keys: summary (2-3 sentences, professional), risk (1-2 sentences), mitigation (array of 3-5 short action items), products (array of affected product names or empty), tags (array of 3-6 topical tags). Return ONLY minified JSON, no markdown.\n\nTITLE: ${article.title}\nSOURCE: ${article.source}\nSNIPPET: ${article.snippet}`,
          maxRetries: 1,
        });
        const jsonStart = text.indexOf("{");
        const jsonEnd = text.lastIndexOf("}");
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
          detail = {
            summary: parsed.summary || detail.summary,
            risk: parsed.risk || detail.risk,
            mitigation: Array.isArray(parsed.mitigation) ? parsed.mitigation.slice(0, 6) : detail.mitigation,
            products: Array.isArray(parsed.products) ? parsed.products.slice(0, 8) : [],
            iocs: [],
            tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : detail.tags,
          };
        }
      } catch (e) {
        console.error("[cyber] ai summary failed", e);
      }
    }
    return { article, detail };
  });

// NVD 2.0 API — public, no key required for low volume.
export type CveRow = {
  id: string;
  cvss: number | null;
  severity: string;
  vendor: string;
  product: string;
  published: string;
  description: string;
  exploited: boolean;
};

const cveCache: { at: number; rows: CveRow[] } = { at: 0, rows: [] };

export const getLatestCves = createServerFn({ method: "GET" }).handler(async () => {
  if (Date.now() - cveCache.at < CACHE_MS && cveCache.rows.length) return cveCache.rows;
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${start.toISOString().replace(/\.\d+Z$/, ".000")}&pubEndDate=${now.toISOString().replace(/\.\d+Z$/, ".000")}&resultsPerPage=40`;
    const res = await fetch(url, {
      headers: { "User-Agent": "KaaluAI/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`nvd ${res.status}`);
    const json = (await res.json()) as any;
    const items: any[] = json?.vulnerabilities ?? [];
    const rows: CveRow[] = items.map((v: any) => {
      const cve = v.cve;
      const m = cve?.metrics?.cvssMetricV31?.[0]?.cvssData ?? cve?.metrics?.cvssMetricV30?.[0]?.cvssData ?? cve?.metrics?.cvssMetricV2?.[0]?.cvssData;
      const cpe = cve?.configurations?.[0]?.nodes?.[0]?.cpeMatch?.[0]?.criteria || "";
      const parts = cpe.split(":");
      return {
        id: cve.id,
        cvss: m?.baseScore ?? null,
        severity: (m?.baseSeverity ?? "UNKNOWN") as string,
        vendor: parts[3] || "—",
        product: parts[4] || "—",
        published: cve.published,
        description: (cve.descriptions?.find((d: any) => d.lang === "en")?.value || "").slice(0, 260),
        exploited: false,
      };
    });
    cveCache.at = Date.now();
    cveCache.rows = rows;
    return rows;
  } catch (e) {
    console.error("[cyber] nvd fail", e);
    return cveCache.rows;
  }
});