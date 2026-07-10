import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Recipient = z.object({ email: z.string().email(), name: z.string().optional() });

export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_drafts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        to: z.array(Recipient).default([]),
        cc: z.array(Recipient).default([]),
        bcc: z.array(Recipient).default([]),
        subject: z.string().default(""),
        body: z.string().default(""),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const payload = {
      user_id: context.userId,
      to_recipients: data.to,
      cc_recipients: data.cc,
      bcc_recipients: data.bcc,
      subject: data.subject,
      body: data.body,
      status: "draft" as const,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("email_drafts")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    } else {
      const { data: inserted, error } = await context.supabase
        .from("email_drafts")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return inserted;
    }
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("email_drafts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });