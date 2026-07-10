import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id,title,pinned,updated_at,created_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: conv, error } = await context.supabase
      .from("conversations")
      .select("id,title,pinned,updated_at,created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Not found");
    const { data: msgs, error: mErr } = await context.supabase
      .from("messages")
      .select("id,role,content,kind,parts,created_at")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);
    return { conversation: conv, messages: msgs ?? [] };
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .insert({ user_id: context.userId, title: "New conversation" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearAllConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMicrosoftStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("microsoft_tokens")
      .select("ms_email,ms_display_name,expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: !!data, ...(data || {}) };
  });

export const disconnectMicrosoft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("microsoft_tokens").delete().eq("user_id", context.userId);
    return { ok: true };
  });