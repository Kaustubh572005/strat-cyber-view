import { createServerFn } from "@tanstack/react-start";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import { z } from "zod";

export type SlideOutline = { title: string; bullets: string[]; notes?: string };

const Input = z.object({
  topic: z.string().min(3).max(400),
  slideCount: z.number().int().min(3).max(25),
  theme: z.enum(["professional", "cybersecurity", "corporate", "education", "business"]),
  audience: z.string().max(200).optional(),
});

export const generatePresentationOutline = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3.1-flash-lite");
    const prompt = `Create a concise, well-structured slide outline for a ${data.slideCount}-slide ${data.theme} presentation on: "${data.topic}".${data.audience ? ` Target audience: ${data.audience}.` : ""}
Return ONLY minified JSON of shape: {"title":"Deck Title","slides":[{"title":"Slide title","bullets":["bullet 1","bullet 2","bullet 3"],"notes":"one sentence speaker note"}]}
Rules: exactly ${data.slideCount} slides. First slide is a title slide (1-2 bullets). Last slide is a summary / Q&A. 3-5 short bullets per content slide (max 12 words each). No markdown, no code fences.`;
    const { text } = await generateText({ model, prompt, maxRetries: 1, temperature: 0.7 });
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("AI returned invalid outline");
    const parsed = JSON.parse(text.slice(s, e + 1));
    const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
    return {
      title: String(parsed.title || data.topic).slice(0, 120),
      slides: slides.slice(0, data.slideCount).map((sl: any) => ({
        title: String(sl.title || "").slice(0, 140),
        bullets: Array.isArray(sl.bullets) ? sl.bullets.slice(0, 6).map((b: any) => String(b).slice(0, 200)) : [],
        notes: sl.notes ? String(sl.notes).slice(0, 400) : "",
      })) as SlideOutline[],
    };
  });