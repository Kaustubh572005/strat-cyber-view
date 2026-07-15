import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type NotificationRow = {
  id: string;
  source_key: string;
  title: string;
  body: string | null;
  link: string | null;
  article_id: string | null;
  severity: string | null;
  created_at: string;
  dismissed: boolean;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: notes, error } = await supabase
      .from("notifications")
      .select("id, source_key, title, body, link, article_id, severity, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const { data: dis } = await supabase
      .from("notification_dismissals")
      .select("notification_id")
      .eq("user_id", userId);
    const dismissed = new Set((dis ?? []).map((d) => d.notification_id));
    return (notes ?? []).map((n) => ({ ...n, dismissed: dismissed.has(n.id) })) as NotificationRow[];
  });

export const dismissNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notification_dismissals")
      .upsert({ user_id: userId, notification_id: data.id }, { onConflict: "user_id,notification_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissAllNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: notes } = await supabase.from("notifications").select("id");
    const rows = (notes ?? []).map((n) => ({ user_id: userId, notification_id: n.id }));
    if (rows.length > 0) {
      await supabase
        .from("notification_dismissals")
        .upsert(rows, { onConflict: "user_id,notification_id" });
    }
    return { ok: true, count: rows.length };
  });
