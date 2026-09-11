// Outlook people/contact search + address-book sync. Server-only.
import { graphFetch } from "@/lib/ms-graph.server";

export type PersonHit = {
  name: string;
  email: string;
  source: string;
  jobTitle?: string | null;
  company?: string | null;
};

function esc(q: string) {
  return q.replace(/["']/g, "").trim();
}

async function json(userId: string, path: string, init?: RequestInit) {
  const res = await graphFetch(userId, path, init);
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : null;
}

type PersonRow = {
  displayName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  companyName?: string;
  scoredEmailAddresses?: Array<{ address?: string }>;
  emailAddresses?: Array<{ address?: string }>;
  mail?: string;
  userPrincipalName?: string;
  companyName_?: string;
};

function collector() {
  const out: PersonHit[] = [];
  const seen = new Set<string>();
  return {
    out,
    push(hit: Partial<PersonHit> & { email?: string }) {
      const addr = (hit.email || "").trim();
      if (!addr || !addr.includes("@")) return;
      const key = addr.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        name: (hit.name || "").trim() || addr,
        email: addr,
        source: hit.source || "outlook",
        jobTitle: hit.jobTitle ?? null,
        company: hit.company ?? null,
      });
    },
  };
}

/**
 * Pulls the user's full Outlook address book (saved contacts + relevant people)
 * and stores it locally so contact search is instant and works offline of
 * Graph's $search quirks. Safe to run repeatedly — rows are upserted.
 */
export async function syncOutlookContacts(userId: string) {
  const c = collector();

  // Saved contacts (paged).
  let next: string | null =
    "/me/contacts?$top=100&$select=displayName,givenName,surname,emailAddresses,jobTitle,companyName";
  let pages = 0;
  while (next && pages < 25) {
    const page: Record<string, unknown> | null = await json(userId, next).catch(() => null);
    if (!page) break;
    for (const r of ((page.value as PersonRow[]) ?? [])) {
      for (const e of r.emailAddresses ?? []) {
        c.push({
          name: r.displayName || [r.givenName, r.surname].filter(Boolean).join(" "),
          email: e.address,
          source: "contacts",
          jobTitle: r.jobTitle,
          company: r.companyName,
        });
      }
    }
    next = (page["@odata.nextLink"] as string | undefined) ?? null;
    pages += 1;
  }

  // Relevant people (frequent correspondents).
  const people = await json(userId, "/me/people?$top=200").catch(() => null);
  for (const r of ((people?.value as PersonRow[]) ?? [])) {
    c.push({
      name: r.displayName,
      email: r.scoredEmailAddresses?.[0]?.address ?? r.emailAddresses?.[0]?.address,
      source: "people",
      jobTitle: r.jobTitle,
      company: r.companyName,
    });
  }

  if (c.out.length === 0) return { synced: 0 };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const rows = c.out.map((p) => ({
    user_id: userId,
    email: p.email.toLowerCase(),
    name: p.name,
    source: p.source,
    job_title: p.jobTitle ?? null,
    company: p.company ?? null,
    updated_at: now,
  }));
  // Chunked upsert keeps request bodies small.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("outlook_contacts")
      .upsert(rows.slice(i, i + 200), { onConflict: "user_id,email" });
    if (error) throw new Error(error.message);
  }
  return { synced: rows.length };
}

async function searchCache(userId: string, q: string, limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("outlook_contacts")
    .select("name, email, source, job_title, company")
    .eq("user_id", userId)
    .limit(limit * 2);
  if (q) {
    const safe = q.replace(/[%,]/g, " ").trim();
    query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
  } else {
    query = query.order("updated_at", { ascending: false });
  }
  const { data } = await query;
  return (data ?? []).map((r) => ({
    name: r.name || r.email,
    email: r.email,
    source: r.source || "address-book",
    jobTitle: r.job_title,
    company: r.company,
  })) as PersonHit[];
}

/**
 * Searches the user's synced Outlook address book first, then live Outlook
 * (relevant people, saved contacts and the organisation directory). Each
 * source is queried independently so a failure in one still returns results.
 * An empty query returns the most recently seen contacts, like Outlook does.
 */
export async function searchPeople(userId: string, rawQuery: string, limit = 10) {
  const q = esc(rawQuery);
  const top = String(Math.min(Math.max(limit, 1), 25));
  const c = collector();

  // 1. Local address book (fast, works for partial names anywhere in the string).
  for (const hit of await searchCache(userId, q, limit).catch(() => [])) c.push(hit);
  if (!q) return c.out.slice(0, limit);
  if (c.out.length >= limit) return c.out.slice(0, limit);

  // 2. Live Outlook lookups.
  const people = json(userId, `/me/people?$search="${encodeURIComponent(q)}"&$top=${top}`);

  const like = q.replace(/'/g, "''");
  const contactFilter = encodeURIComponent(
    `startswith(displayName,'${like}') or startswith(givenName,'${like}') or startswith(surname,'${like}')`,
  );
  const contacts = json(
    userId,
    `/me/contacts?$filter=${contactFilter}&$top=${top}&$select=displayName,emailAddresses,jobTitle,companyName`,
  );

  const directory = json(
    userId,
    `/users?$search="displayName:${encodeURIComponent(q)}" OR "mail:${encodeURIComponent(q)}"&$top=${top}&$select=displayName,mail,userPrincipalName,jobTitle`,
    { headers: { ConsistencyLevel: "eventual" } },
  );

  const [p, ct, d] = await Promise.all([
    people.catch(() => null),
    contacts.catch(() => null),
    directory.catch(() => null),
  ]);

  for (const r of ((p?.value as PersonRow[]) ?? []))
    c.push({
      name: r.displayName,
      email: r.scoredEmailAddresses?.[0]?.address ?? r.emailAddresses?.[0]?.address,
      source: "people",
      jobTitle: r.jobTitle,
      company: r.companyName,
    });
  for (const r of ((ct?.value as PersonRow[]) ?? []))
    c.push({
      name: r.displayName,
      email: r.emailAddresses?.[0]?.address,
      source: "contacts",
      jobTitle: r.jobTitle,
      company: r.companyName,
    });
  for (const r of ((d?.value as PersonRow[]) ?? []))
    c.push({
      name: r.displayName,
      email: r.mail ?? r.userPrincipalName,
      source: "directory",
      jobTitle: r.jobTitle,
    });

  // If the query itself is a full email address, offer it too.
  if (/^\S+@\S+\.\S+$/.test(q)) c.push({ email: q, source: "typed" });

  return c.out.slice(0, limit);
}
