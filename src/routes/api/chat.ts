import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { KAALU_SYSTEM_PROMPT } from "@/lib/kaalu-persona";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const authz = request.headers.get("authorization") || "";
        const token = authz.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await sb.auth.getUser();
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const body = (await request.json()) as {
          messages: UIMessage[];
          conversationId: string;
          kind?: "text" | "voice";
        };
        if (!body?.conversationId) return new Response("conversationId required", { status: 400 });

        // Verify conversation belongs to user
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id,user_id,title")
          .eq("id", body.conversationId)
          .maybeSingle();
        if (!conv || conv.user_id !== userId) return new Response("Forbidden", { status: 403 });

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-2.5-flash");

        const last = body.messages[body.messages.length - 1];
        const userText =
          last && last.role === "user"
            ? last.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
            : "";

        // Persist user message
        if (userText) {
          await supabaseAdmin.from("messages").insert({
            conversation_id: body.conversationId,
            user_id: userId,
            role: "user",
            content: userText,
            kind: body.kind ?? "text",
          });
          // Auto-title on first message
          if (conv.title === "New conversation") {
            const title = userText.trim().slice(0, 60).replace(/\s+/g, " ");
            await supabaseAdmin
              .from("conversations")
              .update({ title, updated_at: new Date().toISOString() })
              .eq("id", body.conversationId);
          } else {
            await supabaseAdmin
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", body.conversationId);
          }
        }

        const { buildMailTools } = await import("@/lib/kaalu-mail-tools.server");

        const result = streamText({
          model,
          system: KAALU_SYSTEM_PROMPT,
          messages: await convertToModelMessages(body.messages),
          tools: buildMailTools(userId),
          // Cap runaway loops and keep replies coherent.
          maxRetries: 2,
          temperature: 0.7,
          stopWhen: stepCountIs(50),
          abortSignal: request.signal,
          onError: ({ error }) => {
            console.error("[chat] stream error", error);
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
          onError: (error) => {
            const msg = error instanceof Error ? error.message : String(error);
            if (/402|payment|credit/i.test(msg))
              return "Kaalu is out of AI credits, Sir. Please top up to continue.";
            if (/429|rate/i.test(msg))
              return "The line is momentarily overloaded, Sir. One moment.";
            return "Apologies, Sir — I lost my train of thought. Please try again.";
          },
          onFinish: async ({ messages }) => {
            const assistantMsg = messages[messages.length - 1];
            if (!assistantMsg || assistantMsg.role !== "assistant") return;
            const text = assistantMsg.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            if (!text) return;
            await supabaseAdmin.from("messages").insert({
              conversation_id: body.conversationId,
              user_id: userId,
              role: "assistant",
              content: text,
              kind: "text",
              parts: JSON.parse(JSON.stringify(assistantMsg.parts)),
            });
            await supabaseAdmin
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", body.conversationId);
          },
        });
      },
    },
  },
});