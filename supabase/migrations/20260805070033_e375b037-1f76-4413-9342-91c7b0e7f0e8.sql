CREATE TABLE public.sebi_public_issues (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_type text NOT NULL,
  external_id text NOT NULL UNIQUE,
  company_name text,
  title text NOT NULL,
  url text NOT NULL,
  pdf_url text,
  filing_date timestamptz,
  ai_summary text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sebi_public_issues TO authenticated;
GRANT SELECT ON public.sebi_public_issues TO anon;
GRANT ALL ON public.sebi_public_issues TO service_role;
ALTER TABLE public.sebi_public_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sebi_public_issues readable" ON public.sebi_public_issues FOR SELECT USING (true);
CREATE TRIGGER trg_sebi_public_issues_updated BEFORE UPDATE ON public.sebi_public_issues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sebi_pi_type_date ON public.sebi_public_issues (doc_type, filing_date DESC);

CREATE TABLE public.sebi_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  external_id text NOT NULL UNIQUE,
  title text NOT NULL,
  url text NOT NULL,
  pdf_url text,
  order_date timestamptz,
  entity_name text,
  ai_summary text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sebi_orders TO authenticated;
GRANT SELECT ON public.sebi_orders TO anon;
GRANT ALL ON public.sebi_orders TO service_role;
ALTER TABLE public.sebi_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sebi_orders readable" ON public.sebi_orders FOR SELECT USING (true);
CREATE TRIGGER trg_sebi_orders_updated BEFORE UPDATE ON public.sebi_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sebi_orders_cat_date ON public.sebi_orders (category, order_date DESC);

CREATE TABLE public.sebi_repo_sync (
  repo_key text NOT NULL PRIMARY KEY,
  display_name text NOT NULL,
  last_synced_at timestamptz,
  last_status text,
  last_error text,
  last_added_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sebi_repo_sync TO authenticated;
GRANT SELECT ON public.sebi_repo_sync TO anon;
GRANT ALL ON public.sebi_repo_sync TO service_role;
ALTER TABLE public.sebi_repo_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sebi_repo_sync readable" ON public.sebi_repo_sync FOR SELECT USING (true);
CREATE TRIGGER trg_sebi_repo_sync_updated BEFORE UPDATE ON public.sebi_repo_sync FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sebi_repo_sync (repo_key, display_name) VALUES
  ('sebi-public-issues', 'SEBI Public Issues'),
  ('sebi-orders', 'SEBI Orders')
ON CONFLICT (repo_key) DO NOTHING;

SELECT cron.schedule(
  'sync-sebi-public-issues-hourly',
  '15 * * * *',
  $$ SELECT net.http_post(url := 'https://project--0ce9c4a5-5137-4175-8790-743ed0a275ea.lovable.app/api/public/sync/sebi/public-issues', headers := '{"Content-Type":"application/json"}'::jsonb) $$
);
SELECT cron.schedule(
  'sync-sebi-orders-hourly',
  '35 * * * *',
  $$ SELECT net.http_post(url := 'https://project--0ce9c4a5-5137-4175-8790-743ed0a275ea.lovable.app/api/public/sync/sebi/orders', headers := '{"Content-Type":"application/json"}'::jsonb) $$
);