import { createHmac, timingSafeEqual } from "crypto";

type StatePayload = { u: string; n: string; t: number };

function secret(): string {
  const value = process.env.MS_OAUTH_STATE_SECRET;
  if (!value) throw new Error("Missing MS_OAUTH_STATE_SECRET");
  return value;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Creates a tamper-proof OAuth state value bound to the signed-in user. */
export function createMsState(userId: string): string {
  const body = Buffer.from(
    JSON.stringify({ u: userId, n: crypto.randomUUID(), t: Date.now() } satisfies StatePayload),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verifies the state signature and freshness; returns the user id or null. */
export function verifyMsState(state: string, maxAgeMs = 15 * 60 * 1000): string | null {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (!payload.u || typeof payload.t !== "number") return null;
    if (Date.now() - payload.t > maxAgeMs) return null;
    return payload.u;
  } catch {
    return null;
  }
}
