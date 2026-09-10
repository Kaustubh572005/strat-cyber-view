// Outlook people/contact search. Server-only.
import { graphFetch } from "@/lib/ms-graph.server";

export type PersonHit = { name: string; email: string; source: string };

function esc(q: string) {
  return q.replace(/["']/g, "").trim();
}

async function json(userId: string, path: string, init?: RequestInit) {
  const res = await graphFetch(userId, path, init);
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : null;
}

/**
 * Searches the signed-in user's Outlook relevant people, saved contacts and
 * (for work/school accounts) the organisation directory. Each source is
 * queried independently so a failure in one still returns results.
 */
export async function searchPeople(userId: string, rawQuery: string, limit = 10) {
  const q = esc(rawQuery);
  if (q.length < 1) return [] as PersonHit[];
  const top = String(Math.min(Math.max(limit, 1), 25));

  const people = json(userId, `/me/people?$search="${encodeURIComponent(q)}"&$top=${top}`);

  const contactFilter = encodeURIComponent(
    `startswith(displayName,'${q.replace(/'/g, "''")}') or startswith(givenName,'${q.replace(/'/g, "''")}') or startswith(surname,'${q.replace(/'/g, "''")}')`,
  );
  const contacts = json(
    userId,
    `/me/contacts?$filter=${contactFilter}&$top=${top}&$select=displayName,emailAddresses`,
  );

  const directory = json(
    userId,
    `/users?$search="displayName:${encodeURIComponent(q)}" OR "mail:${encodeURIComponent(q)}"&$top=${top}&$select=displayName,mail,userPrincipalName`,
    { headers: { ConsistencyLevel: "eventual" } },
  );

  const [p, c, d] = await Promise.all([
    people.catch(() => null),
    contacts.catch(() => null),
    directory.catch(() => null),
  ]);

  const out: PersonHit[] = [];
  const seen = new Set<string>();
  const push = (name: string | undefined, email: string | undefined, source: string) => {
    const addr = (email || "").trim();
    if (!addr || !addr.includes("@")) return;
    const key = addr.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: (name || "").trim() || addr, email: addr, source });
  };

  type PersonRow = {
    displayName?: string;
    scoredEmailAddresses?: Array<{ address?: string }>;
    emailAddresses?: Array<{ address?: string }>;
    mail?: string;
    userPrincipalName?: string;
  };

  for (const r of ((p?.value as PersonRow[]) ?? []))
    push(r.displayName, r.scoredEmailAddresses?.[0]?.address ?? r.emailAddresses?.[0]?.address, "people");
  for (const r of ((c?.value as PersonRow[]) ?? []))
    push(r.displayName, r.emailAddresses?.[0]?.address, "contacts");
  for (const r of ((d?.value as PersonRow[]) ?? []))
    push(r.displayName, r.mail ?? r.userPrincipalName, "directory");

  // If the query itself is a full email address, offer it too.
  if (/^\S+@\S+\.\S+$/.test(q)) push(undefined, q, "typed");

  return out.slice(0, limit);
}
