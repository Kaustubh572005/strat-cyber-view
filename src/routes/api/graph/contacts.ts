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

export const Route = createFileRoute("/api/graph/contacts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const q = new URL(request.url).searchParams.get("q") || "";
        try {
          // Use /me/people search which includes recent contacts + directory
          const params = new URLSearchParams({
            $top: "10",
            $search: `"${q.replace(/"/g, "")}"`,
            $select: "displayName,emailAddresses,scoredEmailAddresses",
          });
          const res = await graphFetch(userId, `/me/people?${params}`);
          return new Response(await res.text(), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response(String(e), { status: 500 });
        }
      },
    },
  },
});