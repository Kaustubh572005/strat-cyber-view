import { createFileRoute } from "@tanstack/react-router";
import { searchPeople } from "@/lib/ms-people.server";
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
          const people = await searchPeople(userId, q, 10);
          return new Response(JSON.stringify({ people }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          if (e instanceof Response) {
            return new Response(JSON.stringify({ people: [], error: "not_connected" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ people: [], error: String(e) }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
