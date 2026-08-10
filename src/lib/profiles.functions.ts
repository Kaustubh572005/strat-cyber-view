import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PresentationProfile = {
  id: string;
  name: string;
  description: string | null;
  audience: string | null;
  presentation_type: string | null;
  tone: string | null;
  language: string;
  content_rules: string[];
  instructions: string | null;
  controls: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const ProfileInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(600).optional().nullable(),
  audience: z.string().max(200).optional().nullable(),
  presentationType: z.string().max(120).optional().nullable(),
  tone: z.string().max(120).optional().nullable(),
  language: z.string().max(40).default("English"),
  contentRules: z.array(z.string().max(300)).max(40).default([]),
  instructions: z.string().max(4000).optional().nullable(),
  controls: z
    .object({
      slideCount: z.number().int().min(4).max(50).optional(),
      detailLevel: z.enum(["concise", "balanced", "dense"]).optional(),
      mode: z.enum(["quick", "corporate", "detailed"]).optional(),
      includeCharts: z.boolean().optional(),
      includeTables: z.boolean().optional(),
      includeTimelines: z.boolean().optional(),
      includeNotes: z.boolean().optional(),
    })
    .default({}),
  isDefault: z.boolean().default(false),
});

function toRow(d: z.infer<typeof ProfileInput>, userId: string) {
  return {
    user_id: userId,
    name: d.name,
    description: d.description ?? null,
    audience: d.audience ?? null,
    presentation_type: d.presentationType ?? null,
    tone: d.tone ?? null,
    language: d.language,
    content_rules: d.contentRules,
    instructions: d.instructions ?? null,
    controls: d.controls,
    is_default: d.isDefault,
  };
}

export const listPresentationProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("presentation_profiles")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PresentationProfile[];
  });

export const savePresentationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    ProfileInput.extend({ id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const row = toRow(data, context.userId);
    if (data.isDefault) {
      await context.supabase
        .from("presentation_profiles")
        .update({ is_default: false })
        .eq("user_id", context.userId);
    }
    if (data.id) {
      const { data: out, error } = await context.supabase
        .from("presentation_profiles")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return out as unknown as PresentationProfile;
    }
    const { data: out, error } = await context.supabase
      .from("presentation_profiles")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out as unknown as PresentationProfile;
  });

export const deletePresentationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("presentation_profiles")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicatePresentationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: src, error } = await context.supabase
      .from("presentation_profiles")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !src) throw new Error(error?.message || "Profile not found");
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src as Record<string, unknown>;
    const { data: out, error: insErr } = await context.supabase
      .from("presentation_profiles")
      .insert({ ...rest, name: `${(src as any).name} (copy)`, is_default: false })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);
    return out as unknown as PresentationProfile;
  });
