import { createFileRoute, redirect } from "@tanstack/react-router";
import { msAuthorizeUrl } from "@/lib/ms-graph.server";
import { createClient } from "@supabase/supabase-js";

function redirectUri(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/api/auth/ms/callback`;
}

export const Route = createFileRoute("/api/auth/ms/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const authHeader = request.headers.get("authorization") || "";
        const token =
          authHeader.replace(/^Bearer\s+/i, "") || url.searchParams.get("t") || "";
        if (!token) return new Response("Unauthorized", { status: 401 });
        // Verify the user via publishable client
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data, error } = await sb.auth.getUser();
        if (error || !data.user) return new Response("Unauthorized", { status: 401 });
        // Signed state so the callback can trust the user it names.
        const { createMsState } = await import("@/lib/oauth-state.server");
        const state = createMsState(data.user.id);
        throw redirect({ href: msAuthorizeUrl(redirectUri(request), state) });
      },
    },
  },
});