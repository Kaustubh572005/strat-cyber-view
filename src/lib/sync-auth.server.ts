import { timingSafeEqual } from "crypto";

/**
 * Scheduled sync routes live under /api/public/* so external schedulers can
 * reach them, so they must authenticate their invoker with a shared secret.
 */
export function isAuthorizedSyncCaller(request: Request): boolean {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-sync-secret") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("secret") ||
    "";
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function syncUnauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
