import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export type FeedArticle = {
  id: string;
  source_key: string;
  external_id: string;
  title: string;
  url: string;
  publisher: string | null;
  category: string | null;
  severity: string | null;
  published_at: string | null;
  snippet: string | null;
  ai_summary: string | null;
  attachment_url: string | null;
  created_at: string;
};

export type NseDisclosureRow = {
  id: string;
  external_id: string;
  symbol: string | null;
  company_name: string | null;
  subject: string | null;
  details: string | null;
  incident_type: string | null;
  notice_datetime: string | null;
  attachment_url: string | null;
  external_url: string | null;
  ai_summary: string | null;
  created_at: string;
};

export type SourceStatus = {
  source_key: string;
  display_name: string;
  category: string;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_added_count: number;
};

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listSourceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const supa = publicClient();
  const { data, error } = await supa
    .from("feed_sources")
    .select("source_key, display_name, category, last_synced_at, last_status, last_error, last_added_count")
    .order("source_key");
  if (error) throw new Error(error.message);
  return (data ?? []) as SourceStatus[];
});

export const listArticles = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        source_key: z.string().optional(),
        source_keys: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(500).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supa = publicClient();
    let q = supa
      .from("feed_articles")
      .select(
        "id, source_key, external_id, title, url, publisher, category, severity, published_at, snippet, ai_summary, attachment_url, created_at",
      )
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.source_key) q = q.eq("source_key", data.source_key);
    else if (data.source_keys && data.source_keys.length > 0) q = q.in("source_key", data.source_keys);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as FeedArticle[];
  });

export const getArticleById = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const supa = publicClient();
    const { data: row, error } = await supa
      .from("feed_articles")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as FeedArticle | null;
  });

export const listNseDisclosures = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        search: z.string().optional(),
        incident_type: z.string().optional(),
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supa = publicClient();
    let q = supa
      .from("nse_disclosures")
      .select("*")
      .order("notice_datetime", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.incident_type) q = q.eq("incident_type", data.incident_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let list = (rows ?? []) as NseDisclosureRow[];
    if (data.year) {
      list = list.filter((r) => r.notice_datetime && new Date(r.notice_datetime).getFullYear() === data.year);
    }
    if (data.month) {
      list = list.filter(
        (r) => r.notice_datetime && new Date(r.notice_datetime).getMonth() + 1 === data.month,
      );
    }
    if (data.search) {
      const s = data.search.toLowerCase();
      list = list.filter(
        (r) =>
          (r.company_name ?? "").toLowerCase().includes(s) ||
          (r.symbol ?? "").toLowerCase().includes(s) ||
          (r.subject ?? "").toLowerCase().includes(s) ||
          (r.details ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  });

// Trigger a sync from the UI (authenticated).
export const refreshSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source_key: z.enum([
          "sebi-whats-new",
          "cert-in",
          "nse-cyber",
          "cyber-news",
          "ai-news",
          "uti-amc-cyber",
          "all",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { runSync } = await import("@/lib/sync-runner.server");
    const sources =
      data.source_key === "all"
        ? (["sebi-whats-new", "cert-in", "nse-cyber", "cyber-news", "ai-news", "uti-amc-cyber"] as const)
        : [data.source_key];
    const results: Array<{ source: string; added: number; total: number; error?: string }> = [];
    for (const s of sources) {
      try {
        const r = await runSync(s as any);
        results.push({ source: s, ...r });
      } catch (e) {
        results.push({ source: s, added: 0, total: 0, error: (e as Error).message });
      }
    }
    return { results };
  });
