import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import type { DeckPlan, TemplateBlueprint } from "./types";

const clamp = (s: unknown, n: number) => String(s ?? "").slice(0, n);

export type DeckControls = {
  mode?: "quick" | "corporate" | "detailed";
  detailLevel?: "concise" | "balanced" | "dense";
  presentationType?: string;
  language?: string;
  includeCharts?: boolean;
  includeTables?: boolean;
  includeTimelines?: boolean;
  includeNotes?: boolean;
};

export async function planDeck(input: {
  bp: TemplateBlueprint;
  topic: string;
  slideCount: number;
  audience?: string;
  tone?: string;
  extraContext?: string;
  references?: string;
  controls?: DeckControls;
}): Promise<DeckPlan> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3.6-flash");

  const layoutList = input.bp.layouts
    .map((l) => `${l.index}: "${l.name}" (role=${l.role}, placeholders=${l.placeholders.join("|") || "none"})`)
    .join("\n");

  const c = input.controls ?? {};
  const density =
    c.detailLevel === "concise"
      ? "Each content slide carries 2 substantial blocks."
      : c.detailLevel === "dense"
        ? "Each content slide must carry 3 substantial blocks and fill the slide fully."
        : "Each content slide carries 2-3 substantial blocks that fill the slide.";
  const allowed = [
    "paragraph",
    "bullets",
    c.includeTables === false ? null : "table",
    "kpis",
    c.includeTimelines === false ? null : "timeline",
    c.includeCharts === false ? null : "chart",
    "twoCol",
  ].filter(Boolean);

  const prompt = `You are a senior management-consulting deck designer building an executive presentation inside a locked corporate PowerPoint template.

TEMPLATE BLUEPRINT
Slide size: ${(input.bp.slideWidthEmu / 914400).toFixed(2)}in x ${(input.bp.slideHeightEmu / 914400).toFixed(2)}in
Theme fonts: ${input.bp.fonts.major} / ${input.bp.fonts.minor}
Theme colors: accent1 #${input.bp.colors.accent1}, accent2 #${input.bp.colors.accent2}, accent4 #${input.bp.colors.accent4}
Available layouts (use the numeric index):
${layoutList}
Existing template slide headings (mirror this house style/section wording where sensible): ${input.bp.sampleSlideTitles.join(" | ") || "n/a"}

TASK
Topic: "${input.topic}"
${input.audience ? `Audience: ${input.audience}\n` : ""}${input.tone ? `Tone: ${input.tone}\n` : ""}${c.presentationType ? `Presentation type: ${c.presentationType}\n` : ""}${c.mode ? `Mode: ${c.mode} deck\n` : ""}${c.language && c.language !== "English" ? `Write all slide text in ${c.language}.\n` : ""}${input.extraContext ? `Additional context to use: ${input.extraContext}\n` : ""}Produce exactly ${input.slideCount} slides.

${
  input.references
    ? `REFERENCE MATERIAL (extracted from files the user uploaded — this is the authoritative source. Reuse its real headings, figures, tables, dates, owners and terminology. Never contradict it, never ignore it):
"""
${input.references}
"""
`
    : ""
}
CONTENT RULES
- Slide 1 must be kind "title" using a layout whose role is title. Include a divider slide before major sections when the deck has 8+ slides. Final slide kind "closing".
- Every content slide must be DENSE and specific — never generic filler, never empty placeholders, never a slide with only 2-3 short bullets. ${density}
- Prefer concrete, realistic figures, owners, dates, controls, regulations and metrics appropriate to the topic and to an Indian asset-management / BFSI context where relevant. When reference material is supplied, take those numbers from it verbatim.
- Vary block types across the deck: allowed kinds are ${allowed.join(", ")}. Do not use "bullets" on more than half the content slides. Use "paragraph" for executive narrative/summary slides (60-90 words per paragraph).
- Max 3 blocks per slide, and keep total volume printable: tables <= 6 columns and <= 7 rows, kpis <= 4, timeline <= 5, chart series <= 6, bullets <= 6 items of <= 16 words.
- Charts must carry plausible numeric values with a unit (e.g. "%", "M", " incidents").
${c.includeNotes === false ? "- Omit the notes field." : "- Every slide needs a substantive 1-2 sentence speaker note."}

Return ONLY minified JSON, no markdown fences, of this exact shape:
{"deckTitle":"...","subtitle":"...","slides":[{"layoutIndex":4,"kind":"title|agenda|divider|content|closing","title":"...","subtitle":"optional","notes":"speaker note","blocks":[
{"kind":"paragraph","heading":"optional","text":"..."},
{"kind":"bullets","items":["..."]},
{"kind":"table","headers":["..."],"rows":[["..."]]},
{"kind":"kpis","items":[{"label":"...","value":"42%","note":"optional"}]},
{"kind":"timeline","items":[{"when":"Q1 FY26","what":"..."}]},
{"kind":"chart","chartTitle":"...","unit":"%","series":[{"label":"...","value":12}]},
{"kind":"twoCol","left":{"heading":"...","items":["..."]},"right":{"heading":"...","items":["..."]}}
]}]}`;

  const { text } = await generateText({ model, prompt, temperature: 0.6, maxRetries: 1 });
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("AI returned an invalid deck plan");
  const raw = JSON.parse(text.slice(s, e + 1));
  return normalizePlan(raw, input.bp, input.slideCount, input.topic);
}


export function normalizePlan(
  raw: any,
  bp: TemplateBlueprint,
  slideCount: number,
  topic: string,
): DeckPlan {
  const validIdx = new Set(bp.layouts.map((l) => l.index));
  const byRole = (role: string) => bp.layouts.find((l) => l.role === role)?.index;
  const fallback: Record<string, number | undefined> = {
    title: byRole("title"),
    divider: byRole("divider"),
    closing: byRole("closing"),
    agenda: byRole("agenda") ?? byRole("content"),
    content: byRole("content"),
  };

  const slides = (Array.isArray(raw?.slides) ? raw.slides : [])
    .slice(0, slideCount)
    .map((sl: any) => {
      const kind = ["title", "agenda", "divider", "content", "closing"].includes(sl?.kind)
        ? sl.kind
        : "content";
      const li = Number(sl?.layoutIndex);
      const layoutIndex =
        validIdx.has(li) ? li : (fallback[kind] ?? fallback["content"] ?? bp.layouts[0]?.index ?? 1);
      return {
        layoutIndex,
        kind,
        title: clamp(sl?.title || topic, 150),
        subtitle: sl?.subtitle ? clamp(sl.subtitle, 200) : undefined,
        notes: sl?.notes ? clamp(sl.notes, 400) : undefined,
        blocks: (Array.isArray(sl?.blocks) ? sl.blocks : []).slice(0, 3).map(normBlock).filter(Boolean),
      };
    });

  return {
    deckTitle: clamp(raw?.deckTitle || topic, 140),
    subtitle: raw?.subtitle ? clamp(raw.subtitle, 200) : undefined,
    slides,
  };
}

function normBlock(b: any) {
  switch (b?.kind) {
    case "bullets":
      return { kind: "bullets", items: (b.items ?? []).slice(0, 8).map((x: any) => clamp(x, 220)) };
    case "table":
      return {
        kind: "table",
        headers: (b.headers ?? []).slice(0, 6).map((x: any) => clamp(x, 60)),
        rows: (b.rows ?? []).slice(0, 8).map((r: any) => (r ?? []).slice(0, 6).map((x: any) => clamp(x, 160))),
      };
    case "kpis":
      return {
        kind: "kpis",
        items: (b.items ?? []).slice(0, 4).map((k: any) => ({
          label: clamp(k?.label, 48),
          value: clamp(k?.value, 16),
          note: k?.note ? clamp(k.note, 60) : undefined,
        })),
      };
    case "timeline":
      return {
        kind: "timeline",
        items: (b.items ?? []).slice(0, 5).map((k: any) => ({
          when: clamp(k?.when, 30),
          what: clamp(k?.what, 120),
        })),
      };
    case "chart":
      return {
        kind: "chart",
        chartTitle: b.chartTitle ? clamp(b.chartTitle, 80) : undefined,
        unit: b.unit ? clamp(b.unit, 8) : undefined,
        series: (b.series ?? []).slice(0, 6).map((s: any) => ({
          label: clamp(s?.label, 24),
          value: Number.isFinite(Number(s?.value)) ? Number(s.value) : 0,
        })),
      };
    case "twoCol":
      return {
        kind: "twoCol",
        left: {
          heading: clamp(b?.left?.heading, 60),
          items: (b?.left?.items ?? []).slice(0, 6).map((x: any) => clamp(x, 160)),
        },
        right: {
          heading: clamp(b?.right?.heading, 60),
          items: (b?.right?.items ?? []).slice(0, 6).map((x: any) => clamp(x, 160)),
        },
      };
    default:
      return null;
  }
}
