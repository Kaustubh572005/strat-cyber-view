import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export type PublicIssueRow = {
  id: string;
  doc_type: string;
  external_id: string;
  company_name: string | null;
  title: string;
  url: string;
  pdf_url: string | null;
  filing_date: string | null;
  ai_summary: string | null;
  created_at: string;
};

export type OrderRow = {
  id: string;
  category: string;
  external_id: string;
  title: string;
  url: string;
  pdf_url: string | null;
  order_date: string | null;
  entity_name: string | null;
  ai_summary: string | null;
  created_at: string;
};

export type RepoSyncRow = {
  repo_key: string;
  display_name: string;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_added_count: number;
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
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

const listInput = z.object({
  doc_type: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  year: z.number().int().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(200),
});

export const listPublicIssues = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    const supa = publicClient();
    let q = supa
      .from("sebi_public_issues")
      .select(
        "id, doc_type, external_id, company_name, title, url, pdf_url, filing_date, ai_summary, created_at",
      )
      .order("filing_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.doc_type) q = q.eq("doc_type", data.doc_type);
    if (data.search) q = q.or(`title.ilike.%${data.search}%,company_name.ilike.%${data.search}%`);
    if (data.year) {
      q = q.gte("filing_date", `${data.year}-01-01`).lt("filing_date", `${data.year + 1}-01-01`);
    }
    if (data.from) q = q.gte("filing_date", data.from);
    if (data.to) q = q.lte("filing_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as PublicIssueRow[];
  });

export const listOrders = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    const supa = publicClient();
    let q = supa
      .from("sebi_orders")
      .select(
        "id, category, external_id, title, url, pdf_url, order_date, entity_name, ai_summary, created_at",
      )
      .order("order_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.category) q = q.eq("category", data.category);
    if (data.search) q = q.or(`title.ilike.%${data.search}%,entity_name.ilike.%${data.search}%`);
    if (data.year) {
      q = q.gte("order_date", `${data.year}-01-01`).lt("order_date", `${data.year + 1}-01-01`);
    }
    if (data.from) q = q.gte("order_date", data.from);
    if (data.to) q = q.lte("order_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as OrderRow[];
  });

export const listSebiRepoStatus = createServerFn({ method: "GET" }).handler(async () => {
  const supa = publicClient();
  const { data, error } = await supa
    .from("sebi_repo_sync")
    .select("repo_key, display_name, last_synced_at, last_status, last_error, last_added_count")
    .order("repo_key");
  if (error) throw new Error(error.message);
  return (data ?? []) as RepoSyncRow[];
});

// Global search across Legal (feed_articles), Public Issues and Orders.
export type GlobalHit = {
  id: string;
  repo: "Legal" | "Public Issues" | "Orders";
  bucket: string;
  title: string;
  url: string;
  pdf_url: string | null;
  date: string | null;
  ai_summary: string | null;
  entity: string | null;
};

export const searchSebiAll = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().min(2),
        repo: z.enum(["all", "legal", "public-issues", "orders"]).default("all"),
        year: z.number().int().optional(),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const supa = publicClient();
    const like = `%${data.q}%`;
    const hits: GlobalHit[] = [];

    if (data.repo === "all" || data.repo === "legal") {
      let q = supa
        .from("feed_articles")
        .select("id, title, url, attachment_url, published_at, ai_summary, category")
        .eq("source_key", "sebi-whats-new")
        .ilike("title", like)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(data.limit);
      if (data.year) {
        q = q.gte("published_at", `${data.year}-01-01`).lt("published_at", `${data.year + 1}-01-01`);
      }
      const { data: rows } = await q;
      (rows ?? []).forEach((r) =>
        hits.push({
          id: r.id,
          repo: "Legal",
          bucket: r.category ?? "Legal",
          title: r.title,
          url: r.url,
          pdf_url: r.attachment_url,
          date: r.published_at,
          ai_summary: r.ai_summary,
          entity: null,
        }),
      );
    }

    if (data.repo === "all" || data.repo === "public-issues") {
      let q = supa
        .from("sebi_public_issues")
        .select("id, doc_type, title, url, pdf_url, filing_date, ai_summary, company_name")
        .or(`title.ilike.${like},company_name.ilike.${like}`)
        .order("filing_date", { ascending: false, nullsFirst: false })
        .limit(data.limit);
      if (data.year) {
        q = q.gte("filing_date", `${data.year}-01-01`).lt("filing_date", `${data.year + 1}-01-01`);
      }
      const { data: rows } = await q;
      (rows ?? []).forEach((r) =>
        hits.push({
          id: r.id,
          repo: "Public Issues",
          bucket: r.doc_type,
          title: r.title,
          url: r.url,
          pdf_url: r.pdf_url,
          date: r.filing_date,
          ai_summary: r.ai_summary,
          entity: r.company_name,
        }),
      );
    }

    if (data.repo === "all" || data.repo === "orders") {
      let q = supa
        .from("sebi_orders")
        .select("id, category, title, url, pdf_url, order_date, ai_summary, entity_name")
        .or(`title.ilike.${like},entity_name.ilike.${like}`)
        .order("order_date", { ascending: false, nullsFirst: false })
        .limit(data.limit);
      if (data.year) {
        q = q.gte("order_date", `${data.year}-01-01`).lt("order_date", `${data.year + 1}-01-01`);
      }
      const { data: rows } = await q;
      (rows ?? []).forEach((r) =>
        hits.push({
          id: r.id,
          repo: "Orders",
          bucket: r.category,
          title: r.title,
          url: r.url,
          pdf_url: r.pdf_url,
          date: r.order_date,
          ai_summary: r.ai_summary,
          entity: r.entity_name,
        }),
      );
    }

    hits.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return hits.slice(0, data.limit);
  });

export const refreshSebiIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        repo: z.enum(["public-issues", "orders", "all"]),
        full: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { runSebiIntelSync } = await import("@/lib/sebi-intel.server");
    const repos = data.repo === "all" ? (["public-issues", "orders"] as const) : [data.repo];
    const results: Array<{ repo: string; added: number; total: number; error?: string }> = [];
    for (const r of repos) {
      try {
        const res = await runSebiIntelSync(r as "public-issues" | "orders", { full: data.full });
        results.push({ repo: r, ...res });
      } catch (e) {
        results.push({ repo: r, added: 0, total: 0, error: (e as Error).message });
      }
    }
    return { results };
  });
