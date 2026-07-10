import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SourceEnum = z.enum(["news", "certin", "sebi", "nse", "bse"]);
export type FeedSourceKey = z.infer<typeof SourceEnum>;

export interface FeedItemDTO {
  id: string;
  source: FeedSourceKey;
  title: string;
  link: string;
  description: string | null;
  ai_summary: string | null;
  severity: string | null;
  publisher: string | null;
  published_at: string | null;
  first_seen_at: string;
  is_new: boolean;
}

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // "New" for 24h since first_seen

function toDto(row: {
  id: string;
  source: string;
  title: string;
  link: string;
  description: string | null;
  ai_summary: string | null;
  severity: string | null;
  publisher: string | null;
  published_at: string | null;
  first_seen_at: string;
}): FeedItemDTO {
  return {
    id: row.id,
    source: row.source as FeedSourceKey,
    title: row.title,
    link: row.link,
    description: row.description,
    ai_summary: row.ai_summary,
    severity: row.severity,
    publisher: row.publisher,
    published_at: row.published_at,
    first_seen_at: row.first_seen_at,
    is_new: Date.now() - new Date(row.first_seen_at).getTime() < FRESH_WINDOW_MS,
  };
}

/** Refresh a source (or all sources) — fetches feeds, upserts new items. */
export const refreshFeeds = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ source: SourceEnum.optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rss = await import("@/lib/rss.server");

    const targets: FeedSourceKey[] = data.source
      ? [data.source]
      : ["news", "certin", "sebi", "nse", "bse"];

    let inserted = 0;
    await Promise.all(
      targets.map(async (source) => {
        let items: Awaited<ReturnType<typeof rss.fetchNews>> = [];
        try {
          if (source === "news") items = await rss.fetchNews();
          else if (source === "certin")
            items = (await rss.fetchCertIn()).map((i) => ({ ...i, publisher: "CERT-In" }));
          else if (source === "sebi")
            items = (await rss.fetchSebi()).map((i) => ({ ...i, publisher: "SEBI" }));
          else if (source === "nse")
            items = (await rss.fetchNseCyber()).map((i) => ({ ...i, publisher: "NSE" }));
          else if (source === "bse")
            items = (await rss.fetchBseCyber()).map((i) => ({ ...i, publisher: "BSE" }));
        } catch (e) {
          console.error(`[feeds] fetch ${source} failed`, e);
          return;
        }
        if (!items.length) return;

        const rows = items.slice(0, 40).map((i) => ({
          source,
          title: i.title.slice(0, 500),
          link: i.link,
          description: i.description ?? null,
          publisher: i.publisher ?? null,
          published_at: i.publishedAt ?? null,
          severity: rss.detectSeverity(i.title, i.description) ?? null,
        }));
        const { error, count } = await supabaseAdmin
          .from("feed_items")
          .upsert(rows, { onConflict: "source,link", ignoreDuplicates: true, count: "exact" });
        if (error) console.error(`[feeds] upsert ${source}`, error);
        else inserted += count ?? 0;
      }),
    );
    return { inserted };
  });

/** List items for a source (most recent first). */
export const listFeed = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ source: SourceEnum, limit: z.number().min(1).max(100).default(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("feed_items")
      .select("*")
      .eq("source", data.source)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("first_seen_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return (rows ?? []).map(toDto);
  });

/** Get all latest items across sources (for the dashboard fetch). */
export const listAllFeeds = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sources: FeedSourceKey[] = ["news", "certin", "sebi", "nse", "bse"];
  const results = await Promise.all(
    sources.map(async (source) => {
      const { data } = await supabaseAdmin
        .from("feed_items")
        .select("*")
        .eq("source", source)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("first_seen_at", { ascending: false })
        .limit(6);
      return [source, (data ?? []).map(toDto)] as const;
    }),
  );
  return Object.fromEntries(results) as Record<FeedSourceKey, FeedItemDTO[]>;
});

/** Get single article; lazily generate an AI summary and cache it. */
export const getArticle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("feed_items")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Article not found");

    // Lazy summary — generate once and store.
    if (!row.ai_summary && (row.description?.length ?? 0) > 80) {
      const { summarize } = await import("@/lib/ai-summary.server");
      const summary = await summarize(row.description ?? "", row.title);
      if (summary) {
        await supabaseAdmin
          .from("feed_items")
          .update({ ai_summary: summary })
          .eq("id", row.id);
        row.ai_summary = summary;
      }
    }

    // Prev / next inside the same source, ordered by first_seen_at.
    const { data: siblings } = await supabaseAdmin
      .from("feed_items")
      .select("id, title, first_seen_at")
      .eq("source", row.source)
      .order("first_seen_at", { ascending: false })
      .limit(200);
    const list = siblings ?? [];
    const idx = list.findIndex((s) => s.id === row.id);
    const prev = idx > 0 ? list[idx - 1] : null;
    const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

    return { article: toDto(row), prev, next };
  });
