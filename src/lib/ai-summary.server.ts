// Lightweight AI summariser using Lovable AI Gateway. Server-only.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function summarize(text: string, title: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const trimmed = text.replace(/\s+/g, " ").slice(0, 4000);
  if (!trimmed || trimmed.length < 40) return null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You are a cybersecurity analyst. Summarise the article in 2 crisp sentences (<=55 words), focusing on what happened, who is affected, and impact. No preamble.",
          },
          { role: "user", content: `Title: ${title}\n\nContent: ${trimmed}` },
        ],
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
