import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_feed_articles",
  title: "List feed articles",
  description:
    "List cyber/regulatory feed articles from the Kaalu repository. Optionally filter by source (sebi, cert-in, cyber-news, ai-news) or search title/snippet.",
  inputSchema: {
    source_key: z.string().optional().describe("Source: sebi | cert-in | cyber-news | ai-news"),
    query: z.string().optional().describe("Case-insensitive keyword to match title/snippet"),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ source_key, query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sb(ctx)
      .from("feed_articles")
      .select("id,source_key,title,snippet,url,published_at,severity,category,publisher,ai_summary")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);
    if (source_key) q = q.eq("source_key", source_key);
    if (query) q = q.or(`title.ilike.%${query}%,snippet.ilike.%${query}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { articles: data },
    };
  },
});
