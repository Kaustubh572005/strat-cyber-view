import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { analyzeTemplate } from "@/lib/pptx/blueprint.server";
import { planDeck } from "@/lib/pptx/planner.server";
import { buildDeckFromTemplate } from "@/lib/pptx/build.server";
import { fetchTemplateBytes, toBase64 } from "@/lib/pptx/storage.server";

const TemplateRef = z.object({ templateId: z.string().min(1) });

export const analyzePptxTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TemplateRef.parse(d))
  .handler(async ({ context, data }) => {
    const { bytes, name } = await fetchTemplateBytes(context.supabase, data.templateId);
    const blueprint = await analyzeTemplate(bytes);
    return { name, blueprint };
  });

export const planPptxDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    TemplateRef.extend({
      topic: z.string().min(3).max(400),
      slideCount: z.number().int().min(4).max(24),
      audience: z.string().max(200).optional(),
      tone: z.string().max(80).optional(),
      extraContext: z.string().max(4000).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { bytes } = await fetchTemplateBytes(context.supabase, data.templateId);
    const bp = await analyzeTemplate(bytes);
    const plan = await planDeck({
      bp,
      topic: data.topic,
      slideCount: data.slideCount,
      audience: data.audience,
      tone: data.tone,
      extraContext: data.extraContext,
    });
    return { blueprint: bp, plan };
  });

export const buildPptxDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    TemplateRef.extend({ plan: z.any() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { bytes } = await fetchTemplateBytes(context.supabase, data.templateId);
    const bp = await analyzeTemplate(bytes);
    const out = await buildDeckFromTemplate(bytes, bp, data.plan);
    return {
      fileName: `${String(data.plan?.deckTitle || "deck").replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}.pptx`,
      base64: toBase64(out),
    };
  });
