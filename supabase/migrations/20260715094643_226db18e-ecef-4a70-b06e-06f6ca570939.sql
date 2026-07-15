
-- feed_sources
CREATE TABLE public.feed_sources (
  source_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  last_synced_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  last_added_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feed_sources TO anon, authenticated;
GRANT ALL ON public.feed_sources TO service_role;
ALTER TABLE public.feed_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_sources readable by all" ON public.feed_sources FOR SELECT USING (true);

-- feed_articles
CREATE TABLE public.feed_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL REFERENCES public.feed_sources(source_key) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  publisher TEXT,
  category TEXT,
  severity TEXT,
  published_at TIMESTAMPTZ,
  snippet TEXT,
  ai_summary TEXT,
  ai_impact TEXT,
  attachment_url TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_key, external_id)
);
CREATE INDEX feed_articles_source_pub_idx ON public.feed_articles (source_key, published_at DESC);
CREATE INDEX feed_articles_created_idx ON public.feed_articles (created_at DESC);
GRANT SELECT ON public.feed_articles TO anon, authenticated;
GRANT ALL ON public.feed_articles TO service_role;
ALTER TABLE public.feed_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_articles readable by all" ON public.feed_articles FOR SELECT USING (true);

-- nse_disclosures
CREATE TABLE public.nse_disclosures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  symbol TEXT,
  company_name TEXT,
  subject TEXT,
  details TEXT,
  incident_type TEXT,
  notice_datetime TIMESTAMPTZ,
  attachment_url TEXT,
  external_url TEXT,
  ai_summary TEXT,
  ai_impact TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nse_disclosures_datetime_idx ON public.nse_disclosures (notice_datetime DESC);
GRANT SELECT ON public.nse_disclosures TO anon, authenticated;
GRANT ALL ON public.nse_disclosures TO service_role;
ALTER TABLE public.nse_disclosures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nse_disclosures readable by all" ON public.nse_disclosures FOR SELECT USING (true);

-- notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  article_id UUID,
  severity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_created_idx ON public.notifications (created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications readable by authenticated" ON public.notifications FOR SELECT TO authenticated USING (true);

CREATE TABLE public.notification_dismissals (
  user_id UUID NOT NULL,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);
GRANT SELECT, INSERT, DELETE ON public.notification_dismissals TO authenticated;
GRANT ALL ON public.notification_dismissals TO service_role;
ALTER TABLE public.notification_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dismissals select" ON public.notification_dismissals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own dismissals insert" ON public.notification_dismissals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own dismissals delete" ON public.notification_dismissals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- sync_runs
CREATE TABLE public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  added_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT
);
CREATE INDEX sync_runs_started_idx ON public.sync_runs (started_at DESC);
GRANT SELECT ON public.sync_runs TO anon, authenticated;
GRANT ALL ON public.sync_runs TO service_role;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_runs readable by all" ON public.sync_runs FOR SELECT USING (true);

-- Seed sources
INSERT INTO public.feed_sources (source_key, display_name, category) VALUES
  ('sebi-whats-new', 'SEBI What''s New', 'regulatory'),
  ('cert-in', 'CERT-In Advisories', 'cybersecurity'),
  ('nse-cyber', 'NSE Cybersecurity Notices', 'regulatory'),
  ('cyber-news', 'Cybersecurity News', 'cybersecurity'),
  ('ai-news', 'AI & Emerging Technology', 'ai')
ON CONFLICT (source_key) DO NOTHING;
