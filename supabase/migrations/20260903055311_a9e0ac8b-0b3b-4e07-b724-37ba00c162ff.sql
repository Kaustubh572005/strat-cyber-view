-- LiveMint feed source registration
INSERT INTO public.feed_sources (source_key, display_name, category)
VALUES ('livemint', 'LiveMint', 'news')
ON CONFLICT (source_key) DO UPDATE SET display_name = 'LiveMint', category = 'news';

-- Single-flight lease locks so multiple tabs/schedulers cannot run the same sync twice
CREATE TABLE IF NOT EXISTS public.sync_locks (
  source_key TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.sync_locks TO service_role;
ALTER TABLE public.sync_locks ENABLE ROW LEVEL SECURITY;

-- Acquire a lease; returns true only when the caller obtained it
CREATE OR REPLACE FUNCTION public.acquire_sync_lock(_source_key TEXT, _ttl_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok BOOLEAN;
BEGIN
  INSERT INTO public.sync_locks (source_key, locked_until, locked_at)
  VALUES (_source_key, now() + make_interval(secs => _ttl_seconds), now())
  ON CONFLICT (source_key) DO UPDATE
    SET locked_until = now() + make_interval(secs => _ttl_seconds),
        locked_at = now()
    WHERE public.sync_locks.locked_until < now()
  RETURNING TRUE INTO ok;
  RETURN COALESCE(ok, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sync_lock(_source_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sync_locks SET locked_until = now() - interval '1 second' WHERE source_key = _source_key;
$$;

-- Move every intelligence sync from hourly to once every 6 hours
SELECT cron.alter_job(1, schedule := '3 0,6,12,18 * * *');
SELECT cron.alter_job(2, schedule := '8 0,6,12,18 * * *');
SELECT cron.alter_job(3, schedule := '13 0,6,12,18 * * *');
SELECT cron.alter_job(4, schedule := '18 0,6,12,18 * * *');
SELECT cron.alter_job(5, schedule := '23 0,6,12,18 * * *');
SELECT cron.alter_job(6, schedule := '35 0,6,12,18 * * *');
SELECT cron.alter_job(7, schedule := '15 0,6,12,18 * * *');
SELECT cron.alter_job(8, schedule := '40 0,6,12,18 * * *');
SELECT cron.alter_job(9, schedule := '25 0,6,12,18 * * *');

SELECT cron.schedule(
  'kaalu-sync-livemint',
  '28 0,6,12,18 * * *',
  $$SELECT net.http_post(
      url := 'https://strat-cyber-view.lovable.app/api/public/sync/livemint',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );$$
);