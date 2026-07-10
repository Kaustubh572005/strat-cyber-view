// Microsoft Graph + OAuth helpers. Server-only.

// Always use the `common` endpoint so both work/school accounts AND personal
// Microsoft accounts (outlook.com / hotmail.com / live.com) can authenticate.
// The Entra app registration must be configured as multi-tenant
// ("Accounts in any organizational directory and personal Microsoft accounts").
const TENANT = "common";
const CLIENT_ID = process.env.MS_CLIENT_ID!;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET!;

export const MS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Contacts.Read",
].join(" ");

export function msAuthorizeUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS_SCOPES,
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?${params}`;
}

export async function msExchangeCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: MS_SCOPES,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`MS token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    id_token?: string;
  };
}

export async function msRefreshToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MS_SCOPES,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`MS refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("microsoft_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const expiresAt = new Date(data.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return data.access_token;
  // Refresh
  try {
    const refreshed = await msRefreshToken(data.refresh_token);
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await supabaseAdmin
      .from("microsoft_tokens")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? data.refresh_token,
        expires_at: newExpiry,
      })
      .eq("user_id", userId);
    return refreshed.access_token;
  } catch (e) {
    console.error("MS refresh failed", e);
    return null;
  }
}

export async function graphFetch(userId: string, path: string, init?: RequestInit) {
  const token = await getValidAccessToken(userId);
  if (!token) throw new Response("Microsoft account not connected", { status: 401 });
  const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return res;
}