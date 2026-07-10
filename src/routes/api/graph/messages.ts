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

const FOLDER_MAP: Record<string, string> = {
  inbox: "inbox",
  drafts: "drafts",
  sent: "sentitems",
  trash: "deleteditems",
};

export const Route = createFileRoute("/api/graph/messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const folder = url.searchParams.get("folder") || "inbox";
        const search = url.searchParams.get("search");
        const top = url.searchParams.get("top") || "30";
        const id = url.searchParams.get("id");
        const graphFolder = FOLDER_MAP[folder] || "inbox";
        try {
          if (id) {
            const res = await graphFetch(userId, `/me/messages/${encodeURIComponent(id)}`);
            return new Response(await res.text(), {
              status: res.status,
              headers: { "Content-Type": "application/json" },
            });
          }
          const params = new URLSearchParams();
          params.set("$top", top);
          params.set(
            "$select",
            "id,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,hasAttachments,importance",
          );
          if (search) {
            params.set("$search", `"${search.replace(/"/g, "")}"`);
          } else {
            params.set("$orderby", "receivedDateTime desc");
          }
          const res = await graphFetch(
            userId,
            `/me/mailFolders/${graphFolder}/messages?${params}`,
            search ? { headers: { ConsistencyLevel: "eventual" } } : undefined,
          );
          return new Response(await res.text(), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response(String(e), { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        const userId = await requireUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return new Response("id required", { status: 400 });
        const res = await graphFetch(userId, `/me/messages/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        return new Response(null, { status: res.status });
      },
    },
  },
});