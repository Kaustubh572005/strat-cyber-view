// Server-only feed fetching and RSS parsing. Kept tiny and dependency-free.

export type FeedSource = "news" | "certin" | "sebi" | "nse" | "bse";

export interface RawItem {
  title: string;
  link: string;
  description?: string;
  publishedAt?: string;
  publisher?: string;
  severity?: string;
}

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));

const stripHtml = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const pick = (block: string, tag: string): string | undefined => {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1].trim()) : undefined;
};

function parseRss(xml: string): RawItem[] {
  const items: RawItem[] = [];
  // <item>…</item> (RSS) OR <entry>…</entry> (Atom)
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const title = pick(b, "title");
    let link = pick(b, "link") ?? "";
    // Atom: <link href="…"/>
    if (!link) {
      const m = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (m) link = m[1];
    }
    const description =
      pick(b, "description") ??
      pick(b, "summary") ??
      pick(b, "content:encoded") ??
      pick(b, "content");
    const publishedAt =
      pick(b, "pubDate") ?? pick(b, "published") ?? pick(b, "updated") ?? pick(b, "dc:date");
    if (!title || !link) continue;
    items.push({
      title: stripHtml(title),
      link: link.trim(),
      description: description ? stripHtml(description).slice(0, 700) : undefined,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
    });
  }
  return items;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KaaluCyberBot/1.0; +https://kaalu.ai)",
      Accept: "application/rss+xml, application/xml, text/xml, text/html, */*",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Fetch ${url} → ${res.status}`);
  return await res.text();
}

// --- Cybersecurity news: aggregate multiple RSS sources ---
const NEWS_SOURCES: Array<{ name: string; url: string }> = [
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
  { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml" },
];

export async function fetchNews(): Promise<Array<RawItem & { publisher: string }>> {
  const all = await Promise.allSettled(
    NEWS_SOURCES.map(async (s) => {
      const xml = await fetchText(s.url);
      return parseRss(xml).map((i) => ({ ...i, publisher: s.name }));
    }),
  );
  return all.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// --- CERT-In advisories ---
export async function fetchCertIn(): Promise<RawItem[]> {
  try {
    const xml = await fetchText("https://www.cert-in.org.in/RSSFeed.jsp?type=A");
    const items = parseRss(xml);
    if (items.length) return items.map((i) => ({ ...i, publisher: "CERT-In" }));
  } catch { /* fall through */ }
  // Fallback: parse listing page
  try {
    const html = await fetchText("https://www.cert-in.org.in/");
    const items: RawItem[] = [];
    const rowRe = /<a[^>]+href=["']([^"']*(?:PDCountryWiseAdvisoryList|VulnerabilityNotes|s2cMainServlet)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) && items.length < 30) {
      const title = stripHtml(m[2]);
      if (!title || title.length < 8) continue;
      const link = m[1].startsWith("http") ? m[1] : `https://www.cert-in.org.in/${m[1].replace(/^\//, "")}`;
      items.push({ title, link, publisher: "CERT-In" });
    }
    return items;
  } catch { return []; }
}

// --- SEBI circulars ---
export async function fetchSebi(): Promise<RawItem[]> {
  try {
    const html = await fetchText(
      "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=6&smid=0",
    );
    const items: RawItem[] = [];
    // Rows contain a date + a link to a circular detail page.
    const rowRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<][\s\S]*?)<\/a>[\s\S]{0,400}?(\d{1,2}\s+\w{3,9}\s*,?\s*\d{4})/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) && items.length < 40) {
      const rawTitle = stripHtml(m[2]);
      const href = m[1];
      if (!rawTitle || rawTitle.length < 10) continue;
      if (!/circular|guideline|advisor|framework|master|amendment/i.test(rawTitle)) continue;
      const link = href.startsWith("http") ? href : `https://www.sebi.gov.in${href.startsWith("/") ? "" : "/"}${href}`;
      const publishedAt = new Date(m[3]).toISOString();
      items.push({ title: rawTitle, link, publishedAt, publisher: "SEBI" });
    }
    return items;
  } catch { return []; }
}

// --- NSE cybersecurity: filter announcements page for cyber/security keywords ---
const CYBER_KW = /cyber|security|information\s*security|isms|ransom|breach|phishing|malware|vulnerab|advisor|technology\s*risk|sebi\s*cyber|resilien|SOC\b|SIEM|zero[- ]day|patch|CVE/i;

export async function fetchNseCyber(): Promise<RawItem[]> {
  try {
    const html = await fetchText("https://www.nseindia.com/resources/exchange-communication-circulars");
    const items: RawItem[] = [];
    const rowRe = /<a[^>]+href=["']([^"']+\.pdf|[^"']+circular[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) && items.length < 40) {
      const title = stripHtml(m[2]);
      if (!title || !CYBER_KW.test(title)) continue;
      const link = m[1].startsWith("http") ? m[1] : `https://www.nseindia.com${m[1].startsWith("/") ? "" : "/"}${m[1]}`;
      items.push({ title, link, publisher: "NSE" });
    }
    return items;
  } catch { return []; }
}

// --- BSE cybersecurity ---
export async function fetchBseCyber(): Promise<RawItem[]> {
  try {
    const html = await fetchText("https://www.bseindia.com/static/about/circulars.aspx");
    const items: RawItem[] = [];
    const rowRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) && items.length < 60) {
      const title = stripHtml(m[2]);
      if (!title || !CYBER_KW.test(title)) continue;
      const link = m[1].startsWith("http") ? m[1] : `https://www.bseindia.com${m[1].startsWith("/") ? "" : "/"}${m[1]}`;
      items.push({ title, link, publisher: "BSE" });
    }
    return items;
  } catch { return []; }
}

// Detect severity from a CERT-In / advisory title.
export function detectSeverity(title: string, desc?: string): string | undefined {
  const s = `${title} ${desc ?? ""}`.toLowerCase();
  if (/\bcritical\b|\bsevere\b/.test(s)) return "critical";
  if (/\bhigh\b/.test(s)) return "high";
  if (/\bmedium\b|\bmoderate\b/.test(s)) return "medium";
  if (/\blow\b/.test(s)) return "low";
  return undefined;
}
