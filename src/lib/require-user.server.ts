import { createClient } from "@supabase/supabase-js";

/**
 * Verifies the Supabase bearer token on a raw server route request.
 * Returns the user id, or null when the caller is not signed in.
 */
export async function getRequestUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return null;

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;

  const sb = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub as string;
}

export function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}
