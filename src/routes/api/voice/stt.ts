import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/voice/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return new Response("file required", { status: 400 });
        const upstream = new FormData();
        upstream.append("file", file, file.name || "recording.webm");
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: upstream,
        });
        if (!res.ok) return new Response(await res.text(), { status: res.status });
        return new Response(res.body, { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});