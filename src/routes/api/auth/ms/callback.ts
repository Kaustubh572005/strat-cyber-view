import { createFileRoute } from "@tanstack/react-router";
import { msExchangeCode } from "@/lib/ms-graph.server";

export const Route = createFileRoute("/api/auth/ms/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const errDesc = url.searchParams.get("error_description");
        if (err) return htmlRedirect(`/settings?ms_error=${encodeURIComponent(errDesc || err)}`);
        if (!code || !state) return htmlRedirect(`/settings?ms_error=missing_code`);
        let userId: string;
        try {
          const decoded = JSON.parse(atob(state)) as { u: string };
          userId = decoded.u;
        } catch {
          return htmlRedirect(`/settings?ms_error=bad_state`);
        }
        const redirectUri = `${url.origin}/api/auth/ms/callback`;
        try {
          const tokens = await msExchangeCode(code, redirectUri);
          // Fetch profile
          const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const me = meRes.ok ? await meRes.json() : {};
          const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("microsoft_tokens").upsert(
            {
              user_id: userId,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expires_at,
              scope: tokens.scope,
              ms_account_id: me.id ?? null,
              ms_email: me.mail || me.userPrincipalName || null,
              ms_display_name: me.displayName || null,
            },
            { onConflict: "user_id" },
          );
          await supabaseAdmin
            .from("profiles")
            .update({
              ms_email: me.mail || me.userPrincipalName || null,
              ms_display_name: me.displayName || null,
            })
            .eq("id", userId);
          // Pull the Outlook address book into Kaalu so contact search works
          // straight away. Never block the redirect on it.
          try {
            const { syncOutlookContacts } = await import("@/lib/ms-people.server");
            await syncOutlookContacts(userId);
          } catch (syncErr) {
            console.error("[ms callback] contact sync failed", syncErr);
          }
          return htmlRedirect(`/mail?ms_connected=1`);
        } catch (e) {
          console.error("[ms callback]", e);
          const msg = e instanceof Error ? e.message : String(e);
          return htmlRedirect(`/settings?ms_error=${encodeURIComponent(msg.slice(0, 400))}`);
        }
      },
    },
  },
});

function htmlRedirect(to: string) {
  return new Response(
    `<!doctype html><meta http-equiv="refresh" content="0;url=${to}"><script>location.replace(${JSON.stringify(to)})</script>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}