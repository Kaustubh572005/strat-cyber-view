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
  name: "get_conversation",
  title: "Get conversation",
  description: "Fetch a single conversation with its messages (oldest first).",
  inputSchema: {
    id: z.string().uuid().describe("Conversation UUID"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = sb(ctx);
    const { data: conv, error: cErr } = await client
      .from("conversations")
      .select("id,title,pinned,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (cErr) return { content: [{ type: "text", text: cErr.message }], isError: true };
    if (!conv) return { content: [{ type: "text", text: "Not found" }], isError: true };
    const { data: messages, error: mErr } = await client
      .from("messages")
      .select("id,role,content,kind,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (mErr) return { content: [{ type: "text", text: mErr.message }], isError: true };
    const result = { conversation: conv, messages };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
