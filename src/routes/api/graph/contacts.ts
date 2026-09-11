import { createFileRoute } from "@tanstack/react-router";
import { searchPeople, syncOutlookContacts } from "@/lib/ms-people.server";
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
          return jsonResponse({ people });
        } catch (e) {
          if (e instanceof Response) return jsonResponse({ people: [], error: "not_connected" });
          return jsonResponse({ people: [], error: String(e) });
        }
      },
      // Sync the user's Outlook address book into Kaalu's contact store.
      POST: async ({ request }) => {
        const userId = await requireUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        try {
          const result = await syncOutlookContacts(userId);
          return jsonResponse({ ok: true, ...result });
        } catch (e) {
          if (e instanceof Response) return jsonResponse({ ok: false, error: "not_connected" });
          return jsonResponse({ ok: false, error: String(e) }, 500);
        }
      },
    },
  },
});
