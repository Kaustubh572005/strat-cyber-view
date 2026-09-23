import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedSyncCaller, syncUnauthorized } from "@/lib/sync-auth.server";

async function handle(repo: string, request: Request) {
  if (!isAuthorizedSyncCaller(request)) return syncUnauthorized();
  if (repo !== "public-issues" && repo !== "orders") {
    return new Response(JSON.stringify({ error: "unknown repo" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const full = new URL(request.url).searchParams.get("full") === "1";
  try {
    const { runSebiIntelSync } = await import("@/lib/sebi-intel.server");
    const result = await runSebiIntelSync(repo, { full });
    return Response.json({ ok: true, repo, ...result });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, repo, error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/sync/sebi/$repo")({
  server: {
    handlers: {
      GET: async ({ params, request }) => handle(params.repo, request),
      POST: async ({ params, request }) => handle(params.repo, request),
    },
  },
});
