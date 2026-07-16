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
  name: "list_notifications",
  title: "List notifications",
  description: "List recent regulatory and cyber notifications across all sources.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 30)"),
    source_key: z.string().optional().describe("Filter by source_key (sebi, cert-in, cyber-news, ai-news, nse)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, source_key }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sb(ctx)
      .from("notifications")
      .select("id,title,body,link,severity,source_key,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (source_key) q = q.eq("source_key", source_key);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { notifications: data },
    };
  },
});
