import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("presentation_templates")
      .select("id,name,storage_path,is_default,size_bytes,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        storage_path: z.string().min(1).max(500),
        size_bytes: z.number().int().nonnegative(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("presentation_templates")
      .insert({
        user_id: context.userId,
        name: data.name,
        storage_path: data.storage_path,
        size_bytes: data.size_bytes,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const renameTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("presentation_templates")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await context.supabase
      .from("presentation_templates")
      .update({ is_default: false })
      .eq("user_id", context.userId);
    const { error } = await context.supabase
      .from("presentation_templates")
      .update({ is_default: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: src, error: sErr } = await context.supabase
      .from("presentation_templates")
      .select("name,storage_path,size_bytes")
      .eq("id", data.id)
      .maybeSingle();
    if (sErr || !src) throw new Error(sErr?.message || "Template not found");
    // Copy the underlying file into a new storage key so the two entries
    // remain independent even if one is later deleted.
    const ext = src.storage_path.split(".").pop() || "pptx";
    const newPath = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const { data: blob, error: dErr } = await context.supabase.storage
      .from("pptx-templates")
      .download(src.storage_path);
    if (dErr || !blob) throw new Error(dErr?.message || "Download failed");
    const { error: uErr } = await context.supabase.storage
      .from("pptx-templates")
      .upload(newPath, blob, {
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
    if (uErr) throw new Error(uErr.message);
    const { error: iErr } = await context.supabase
      .from("presentation_templates")
      .insert({
        user_id: context.userId,
        name: `${src.name} (copy)`,
        storage_path: newPath,
        size_bytes: src.size_bytes,
      });
    if (iErr) throw new Error(iErr.message);
    return { ok: true };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("presentation_templates")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) {
      await context.supabase.storage
        .from("pptx-templates")
        .remove([row.storage_path]);
    }
    const { error } = await context.supabase
      .from("presentation_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTemplateDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("presentation_templates")
      .select("storage_path,name")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message || "Not found");
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("pptx-templates")
      .createSignedUrl(row.storage_path, 300);
    if (sErr || !signed) throw new Error(sErr?.message || "Signed URL failed");
    return { url: signed.signedUrl, name: row.name };
  });