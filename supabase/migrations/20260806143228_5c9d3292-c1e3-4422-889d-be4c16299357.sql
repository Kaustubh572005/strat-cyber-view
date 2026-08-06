INSERT INTO public.feed_sources (source_key, display_name, category)
VALUES ('cert-in-vuln', 'CERT-In Vulnerability Notes', 'regulatory')
ON CONFLICT (source_key) DO NOTHING;

SELECT cron.schedule(
  'sync-cert-in-vuln',
  '25 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--0ce9c4a5-5137-4175-8790-743ed0a275ea.lovable.app/api/public/sync/cert-in-vuln',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_HbG6angFjngWusUQJLUvng_DBqpKYfV"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);