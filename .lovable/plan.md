
# Kaalu AI — Enterprise Intelligence Foundation

Ship the persistent data layer, hourly background sync, permanent repositories, notifications, and the small UI pieces in one pass. Presentation template engine and CVE/Breach dedicated feeds land in follow-up turns.

## What ships in this turn

1. Persistent repositories for every feed (append-only, dedup by stable ID).
2. Hourly background sync via `pg_cron` + `pg_net` calling a public API route per source.
3. All modules read from DB (never scrape at page render).
4. "New" badge + toast when fresh rows arrive; "Last Updated" per module.
5. Notification Center (bell in header, dedicated page, unread-until-dismissed).
6. AI Daily Brief widget on the dashboard.
7. NSE module rewritten: NSE JSON endpoint with session priming, cyber-keyword filter, permanent repo. BSE removed.
8. SEBI "What's New" full feed (not cyber-only).
9. CERT-In advisories from `cert-in.org.in`.
10. Data Breach Checker → professional CTA card linking to Have I Been Pwned (no API).
11. Manual "Refresh now" per module (calls the same sync endpoint on demand).
12. Fix hydration error on `/auth`.

## Data model (one migration)

```text
feed_sources        source_key, display_name, last_synced_at, last_status
feed_articles       id, source_key, external_id (unique per source),
                    title, url, published_at, ai_summary, severity,
                    category, publisher, attachment_url, raw jsonb,
                    created_at   -- append-only, never deleted
notifications       id, user_id (nullable = global), source_key,
                    title, article_id, created_at, dismissed_at
nse_disclosures     id, symbol, company_name, subject, details, notice_date,
                    notice_time, attachment_url, ai_summary, external_id unique
sync_runs           id, source_key, started_at, finished_at, added_count, error
```

- Dedup: `UNIQUE (source_key, external_id)` — insert with `ON CONFLICT DO NOTHING`.
- RLS: `feed_articles`, `nse_disclosures`, `feed_sources`, `sync_runs` = public read (anon SELECT). `notifications` = per-user + global rows readable by all authenticated users; dismiss writes user-scoped rows.
- GRANTs included per table.

## Sync architecture

```text
pg_cron (hourly)
  → net.http_post → /api/public/sync/{source}
      → scrape/fetch official source
      → dedupe on external_id
      → INSERT new rows
      → generate notifications for new rows
      → update sync_runs + feed_sources.last_synced_at
```

Sources wired:
- `sebi-whats-new` — SEBI What's New page
- `cert-in` — CERT-In advisories listing
- `nse-cyber` — NSE announcements JSON, subject sort A→Z, filter General Updates ∩ cyber keywords
- `cyber-news` — curated cyber news RSS aggregate
- `ai-news` — AI/emerging tech RSS aggregate

Each endpoint is also callable from the UI's "Refresh now" button (same handler, just triggered by user).

## UI changes

- `dashboard.tsx`: widget grid reading from DB. Widgets: Cyber News, AI News, SEBI, CERT-In, NSE, AI Daily Brief, Notification Center preview, Task Reminder. Each shows 5–10 rows + "View All" + "Last Updated" + "Refresh now".
- `cyber.tsx`: repository view reading from DB, filters (source, severity, date), search.
- `sebi.tsx`: renamed heading "SEBI What's New", full listing (not cyber-only), filters, PDF download when attachment present.
- New `cert-in.tsx` route: dedicated CERT-In repository with severity, affected products, mitigation from raw payload.
- `markets.tsx` → replaced by `nse.tsx`: NSE Cybersecurity Notices repository with search (company / symbol / subject / keyword), filters (year, month, incident type), sort options.
- BSE removed from sidebar, routes, and `regulatory.functions.ts`.
- Sidebar: add Notifications and CERT-In items.
- Header: bell icon with unread count → Notification Center.
- New `notifications.tsx` route.
- Breach Checker card on Cyber page replaced with professional "Open Have I Been Pwned" CTA (already partly there — polish it).
- AI summaries generated inside the sync endpoint (Lovable AI Gateway) and stored, so the UI never blocks on AI.

## What is deferred to next turn

- Presentation template engine (layout-based .pptx generation preserving masters/theme/fonts).
- Dedicated CVE feed (NVD JSON) and dedicated Cyber Breaches feed (curated sources).
- Article prev/next polish in the new DB-backed cyber repo.

Both are large enough to warrant their own turn and their own QA pass.

## Technical notes

- Sync endpoints live under `src/routes/api/public/sync/*` — bypass auth, verify a shared `X-Sync-Key` header sourced from `SUPABASE_ANON_KEY` (pg_cron sends it; UI "Refresh now" calls through an authenticated server fn that adds the same header server-side).
- NSE fetch: prime `https://www.nseindia.com/` for cookies, then hit `/api/corporate-announcements?index=equities&subject=General%20Updates` with a browser User-Agent + retries. Filter results client-of-scraper-side by cyber regex.
- CERT-In: parse the advisories index HTML server-side; store advisory number as `external_id`.
- SEBI: prefer official `sebirss.xml`; fall back to scraping the What's New HTML block; store SEBI's item hash as `external_id`.
- All server-side HTTP uses `AbortSignal.timeout(9000)` and `try/catch` — a failing source records an error in `sync_runs` and does not blank the dashboard; the DB rows from prior syncs remain visible.
- Auto-refresh polling on the client stays at 5 min but queries the DB, not external sources.
- Fix `/auth` hydration mismatch (top-level branch mismatch between SSR and client) by rendering the auth shell without an SSR/client branch.

## Deliverables (verification report at end of turn)

- Source URL used per module.
- SQL schema summary.
- Dedup logic per source (which field is `external_id`).
- Cron schedule + how "Refresh now" reuses the same endpoint.
- How notifications are generated + dismissed.
- Where AI summaries are generated and cached.
- Known limits (NSE anti-bot, CERT-In HTML shape) and how each degrades gracefully.
