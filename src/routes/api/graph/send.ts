import { createFileRoute } from "@tanstack/react-router";
import { graphFetch } from "@/lib/ms-graph.server";
import { createClient } from "@supabase/supabase-js";

async function requireUserId(request: Request): Promise<string | null> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

type Recipient = { email: string; name?: string };
function toRecipients(list: Recipient[]) {
  return list.map((r) => ({ emailAddress: { address: r.email, name: r.name } }));
}

export const Route = createFileRoute("/api/graph/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await requireUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json()) as {
          draftId?: string;
          to: Recipient[];
          cc?: Recipient[];
          bcc?: Recipient[];
          subject: string;
          body: string;
          contentType?: "Text" | "HTML";
          attachments?: Array<{ name: string; contentType?: string; contentBytes: string }>;
        };
        if (!body.to?.length) return new Response("to required", { status: 400 });
        const attachments = (body.attachments ?? []).map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.name,
          contentType: a.contentType || "application/octet-stream",
          contentBytes: a.contentBytes,
        }));
        // Graph rejects sendMail payloads above ~4 MB.
        const totalBytes = attachments.reduce((n, a) => n + a.contentBytes.length * 0.75, 0);
        if (totalBytes > 3.5 * 1024 * 1024) {
          return new Response("Attachments too large (max ~3.5 MB in total)", { status: 413 });
        }
        const payload = {
          message: {
            subject: body.subject || "(no subject)",
            body: { contentType: body.contentType ?? "HTML", content: body.body ?? "" },
            toRecipients: toRecipients(body.to),
            ccRecipients: toRecipients(body.cc ?? []),
            bccRecipients: toRecipients(body.bcc ?? []),
            ...(attachments.length ? { attachments } : {}),
          },
          saveToSentItems: true,
        };
        const res = await graphFetch(userId, `/me/sendMail`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          return new Response(await res.text(), { status: res.status });
        }
        // Mark local draft as sent
        if (body.draftId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("email_drafts")
            .update({ status: "sent" })
            .eq("id", body.draftId)
            .eq("user_id", userId);
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});