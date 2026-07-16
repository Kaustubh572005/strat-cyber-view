import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StarField } from "@/components/kaalu/StarField";

type OAuthClient = { name?: string; client_id?: string; redirect_uri?: string } | null;
type AuthorizationDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <StarField />
      <div className="glass-strong relative z-10 max-w-md rounded-2xl p-8">
        <h1 className="text-xl font-semibold neon-text mb-2">Authorization error</h1>
        <p className="text-sm text-muted-foreground">
          {(error as Error)?.message ?? String(error)}
        </p>
      </div>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthApi().approveAuthorization(authorization_id)
      : await oauthApi().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <StarField />
      <div className="glass-strong relative z-10 w-full max-w-md rounded-2xl p-8 neon-ring">
        <h1 className="text-2xl font-semibold neon-text mb-2">
          Connect {clientName} to Kaalu
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          This lets {clientName} use Kaalu as you — reading your conversations
          and the cyber intelligence repository through the MCP server.
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          This does not bypass Kaalu's permissions or backend policies.
        </p>
        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
            {busy ? "Working…" : "Approve"}
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => decide(false)} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
