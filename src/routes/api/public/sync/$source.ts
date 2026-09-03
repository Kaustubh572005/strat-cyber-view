import { createFileRoute } from "@tanstack/react-router";
import { runSync, type SourceKey } from "@/lib/sync-runner.server";

const VALID: SourceKey[] = [
  "sebi-whats-new",
  "cert-in",
  "cert-in-vuln",
  "nse-cyber",
  "cyber-news",
  "ai-news",
  "uti-amc-cyber",
  "livemint",
];

async function handle(source: string) {
  if (!VALID.includes(source as SourceKey)) {
    return new Response(JSON.stringify({ error: "unknown source" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const result = await runSync(source as SourceKey);
    return Response.json({ ok: true, source, ...result });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, source, error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/public/sync/$source")({
  server: {
    handlers: {
      GET: async ({ params }) => handle(params.source),
      POST: async ({ params }) => handle(params.source),
    },
  },
});
