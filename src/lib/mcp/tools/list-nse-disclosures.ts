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
  name: "list_nse_disclosures",
  title: "List NSE cyber disclosures",
  description: "List NSE cybersecurity disclosures (filtered from General Updates).",
  inputSchema: {
    query: z.string().optional().describe("Case-insensitive keyword filter"),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sb(ctx)
      .from("nse_disclosures")
      .select("*")
      .order("broadcast_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);
    if (query) q = q.or(`company_name.ilike.%${query}%,subject.ilike.%${query}%,details.ilike.%${query}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { disclosures: data },
    };
  },
});
