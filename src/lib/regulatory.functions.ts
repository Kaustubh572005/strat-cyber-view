import { createServerFn } from "@tanstack/react-start";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export type RegItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceId: string;
  category: string;
  publishedAt: string;
  snippet: string;
};

type CachedList = { at: number; items: RegItem[] };
const cache = new Map<string, CachedList>();
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

async function fetchRss(opts: {
  id: string;
  source: string;
  url: string;
  category: string;
  max?: number;
}): Promise<RegItem[]> {
  const cached = cache.get(opts.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.items;
  try {
    const res = await fetch(opts.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KaaluAI/1.0; +https://kaalu-voice-wise-assistant.lovable.app)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`${opts.id} ${res.status}`);
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
    const parsed = parser.parse(xml);
    let raw: any[] = [];
    if (parsed?.rss?.channel?.item) {
      raw = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
    } else if (parsed?.feed?.entry) {
      raw = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
    }
    const items: RegItem[] = raw.slice(0, opts.max ?? 25).map((it: any) => {
      const title = stripHtml(it.title?.["#text"] ?? it.title ?? "");
      const link =
        typeof it.link === "string"
          ? it.link
          : it.link?.["@_href"] ?? it.link?.[0]?.["@_href"] ?? it.link?.["#text"] ?? "";
      const desc = stripHtml(it.description ?? it.summary ?? it.content ?? it["content:encoded"] ?? "");
      const pub = it.pubDate ?? it.published ?? it.updated ?? new Date().toISOString();
      return {
        id: hash(`${opts.id}:${link || title}`),
        title,
        link,
        source: opts.source,
        sourceId: opts.id,
        category: opts.category,
        publishedAt: new Date(pub).toISOString(),
        snippet: desc.slice(0, 400),
      };
    });
    cache.set(opts.id, { at: Date.now(), items });
    return items;
  } catch (e) {
    console.error("[regulatory] fetch fail", opts.id, e);
    return cached?.items ?? [];
  }
}

// SEBI has a Google News-backed RSS since the official site rarely exposes a
// working feed. We try the official URL first and fall back to Google News.
async function fetchSebi(): Promise<RegItem[]> {
  const primary = await fetchRss({
    id: "sebi-official",
    source: "SEBI",
    url: "https://www.sebi.gov.in/sebirss.xml",
    category: "Circular",
    max: 40,
  });
  if (primary.length > 0) return primary;
  return fetchRss({
    id: "sebi-google",
    source: "SEBI (Google News)",
    url: "https://news.google.com/rss/search?q=SEBI+circular+OR+SEBI+notification&hl=en-IN&gl=IN&ceid=IN:en",
    category: "Circular",
    max: 40,
  });
}

function classifySebi(title: string): string {
  const t = title.toLowerCase();
  if (/cyber|security|vapt|it\s|resilien/i.test(t)) return "Cybersecurity";
  if (/mutual\s?fund|mf\b/.test(t)) return "Mutual Funds";
  if (/broker|stock\s?broker|trading\s?member/.test(t)) return "Brokers";
  if (/depositor|depository|dp\b/.test(t)) return "Depositories";
  if (/exchange|stock\s?exchange|mii|market\s?infrastructure/.test(t)) return "Market Infrastructure";
  if (/compliance|listing|disclosure|lodr/.test(t)) return "Compliance";
  return "General";
}

export const getSebiCirculars = createServerFn({ method: "GET" }).handler(async () => {
  const items = await fetchSebi();
  const enriched = items.map((it) => ({ ...it, category: classifySebi(it.title) }));
  enriched.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const kpis = {
    total: enriched.length,
    today: enriched.filter((i) => new Date(i.publishedAt).toDateString() === new Date().toDateString()).length,
    cyber: enriched.filter((i) => i.category === "Cybersecurity").length,
    compliance: enriched.filter((i) => i.category === "Compliance").length,
  };
  return { items: enriched, kpis, updatedAt: new Date().toISOString() };
});

// Best-effort financial-markets aggregator. NSE/BSE don't publish reliable
// public RSS, so we route through Google News for them; CERT-In has a real
// feed. Cyber vulnerabilities come from the shared cyber feed cache.
export const getMarketsIntel = createServerFn({ method: "GET" }).handler(async () => {
  const [certIn, nse, bse, sebi] = await Promise.all([
    fetchRss({
      id: "cert-in",
      source: "CERT-In",
      url: "https://www.cert-in.org.in/RSS/latestnews.xml",
      category: "Advisory",
      max: 25,
    }),
    fetchRss({
      id: "nse-google",
      source: "NSE India",
      url: "https://news.google.com/rss/search?q=NSE+India+circular+OR+announcement&hl=en-IN&gl=IN&ceid=IN:en",
      category: "Announcement",
      max: 20,
    }),
    fetchRss({
      id: "bse-google",
      source: "BSE India",
      url: "https://news.google.com/rss/search?q=BSE+India+notice+OR+circular&hl=en-IN&gl=IN&ceid=IN:en",
      category: "Announcement",
      max: 20,
    }),
    fetchSebi(),
  ]);
  const merged = [...certIn, ...nse, ...bse, ...sebi.slice(0, 15)];
  merged.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const today = new Date().toDateString();
  const kpis = {
    circularsToday: sebi.filter((i) => new Date(i.publishedAt).toDateString() === today).length,
    certInAdvisories: certIn.length,
    nseAnnouncements: nse.length,
    bseAnnouncements: bse.length,
    criticalKeywords: merged.filter((i) => /critical|zero.?day|ransomware|breach|exploit/i.test(i.title)).length,
  };
  return {
    items: merged,
    grouped: {
      certIn,
      nse,
      bse,
      sebi: sebi.slice(0, 15),
    },
    kpis,
    updatedAt: new Date().toISOString(),
  };
});

export const summarizeRegItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ title: z.string(), snippet: z.string(), source: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { summary: data.snippet.slice(0, 320), impact: "AI summary unavailable." };
    }
    try {
      const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
      const { generateText } = await import("ai");
      const gateway = createLovableAiGatewayProvider(key);
      const model = gateway("google/gemini-3.1-flash-lite");
      const { text } = await generateText({
        model,
        prompt: `Summarize this Indian regulatory / market notice for a busy executive. Return ONLY minified JSON with keys "summary" (2 sentences) and "impact" (1 sentence describing compliance or operational impact). No markdown, no code fences.\n\nSOURCE: ${data.source}\nTITLE: ${data.title}\nCONTENT: ${data.snippet}`,
        maxRetries: 1,
        temperature: 0.4,
      });
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s < 0 || e <= s) throw new Error("no json");
      const parsed = JSON.parse(text.slice(s, e + 1));
      return {
        summary: String(parsed.summary || data.snippet.slice(0, 320)),
        impact: String(parsed.impact || "Review the full circular for details."),
      };
    } catch (e) {
      console.error("[regulatory] ai fail", e);
      return { summary: data.snippet.slice(0, 320), impact: "Review the full notice for details." };
    }
  });