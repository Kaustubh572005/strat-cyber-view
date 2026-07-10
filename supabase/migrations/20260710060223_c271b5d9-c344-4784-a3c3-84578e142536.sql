
CREATE TABLE public.feed_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  description TEXT,
  ai_summary TEXT,
  severity TEXT,
  publisher TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, link)
);
CREATE INDEX feed_items_source_published_idx ON public.feed_items (source, published_at DESC NULLS LAST, first_seen_at DESC);
GRANT SELECT ON public.feed_items TO anon, authenticated;
GRANT ALL ON public.feed_items TO service_role;
ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read feed_items" ON public.feed_items FOR SELECT TO anon, authenticated USING (true);
