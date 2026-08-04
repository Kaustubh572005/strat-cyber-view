import type { SupabaseClient } from "@supabase/supabase-js";

export const BUILTIN_TEMPLATE_ID = "builtin-uti-amc";
const BUILTIN_PATH = "system/uti-amc-format.pptx";

export function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function fetchTemplateBytes(
  supabase: SupabaseClient<any>,
  templateId: string,
): Promise<{ bytes: ArrayBuffer; name: string }> {
  if (templateId === BUILTIN_TEMPLATE_ID) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage.from("pptx-templates").download(BUILTIN_PATH);
    if (error || !data) throw new Error(error?.message || "Built-in template unavailable");
    return { bytes: await data.arrayBuffer(), name: "UTI AMC Corporate Format" };
  }

  const { data: row, error } = await supabase
    .from("presentation_templates")
    .select("name,storage_path")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !row) throw new Error(error?.message || "Template not found");
  const { data: blob, error: dErr } = await supabase.storage
    .from("pptx-templates")
    .download(row.storage_path);
  if (dErr || !blob) throw new Error(dErr?.message || "Template download failed");
  return { bytes: await blob.arrayBuffer(), name: row.name };
}
