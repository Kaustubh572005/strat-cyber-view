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

export const extractReferenceFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        files: z
          .array(
            z.object({
              name: z.string().min(1).max(260),
              mime: z.string().max(120).optional(),
              base64: z.string().min(4),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { extractReference } = await import("@/lib/pptx/extract.server");
    const digests = [];
    for (const f of data.files) digests.push(await extractReference(f));
    return { digests };
  });

export const planPptxDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    TemplateRef.extend({
      topic: z.string().min(3).max(400),
      slideCount: z.number().int().min(4).max(50),
      audience: z.string().max(200).optional(),
      tone: z.string().max(80).optional(),
      extraContext: z.string().max(4000).optional(),
      references: z
        .array(
          z.object({
            name: z.string(),
            kind: z.string(),
            chars: z.number(),
            text: z.string(),
          }),
        )
        .max(10)
        .optional(),
      profile: z
        .object({
          name: z.string().max(160).optional(),
          description: z.string().max(600).optional(),
          contentRules: z.array(z.string().max(300)).max(40).optional(),
          instructions: z.string().max(4000).optional(),
        })
        .optional(),
      controls: z
        .object({
          mode: z.enum(["quick", "corporate", "detailed"]).optional(),
          detailLevel: z.enum(["concise", "balanced", "dense"]).optional(),
          presentationType: z.string().max(80).optional(),
          language: z.string().max(40).optional(),
          includeCharts: z.boolean().optional(),
          includeTables: z.boolean().optional(),
          includeTimelines: z.boolean().optional(),
          includeNotes: z.boolean().optional(),
        })
        .optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { bytes } = await fetchTemplateBytes(context.supabase, data.templateId);
    const bp = await analyzeTemplate(bytes);
    const { buildReferenceCorpus } = await import("@/lib/pptx/extract.server");
    const plan = await planDeck({
      bp,
      topic: data.topic,
      slideCount: data.slideCount,
      audience: data.audience,
      tone: data.tone,
      extraContext: data.extraContext,
      references: data.references?.length ? buildReferenceCorpus(data.references) : undefined,
      controls: data.controls,
      profile: data.profile,
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
