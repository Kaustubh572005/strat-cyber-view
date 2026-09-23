-- Lock the shared intelligence tables down to signed-in users only.
DROP POLICY IF EXISTS "feed_articles readable by all" ON public.feed_articles;
CREATE POLICY "feed_articles readable by signed-in users" ON public.feed_articles
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.feed_articles FROM anon;
GRANT SELECT ON public.feed_articles TO authenticated;

DROP POLICY IF EXISTS "Public read feed_items" ON public.feed_items;
CREATE POLICY "feed_items readable by signed-in users" ON public.feed_items
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.feed_items FROM anon;
GRANT SELECT ON public.feed_items TO authenticated;

DROP POLICY IF EXISTS "feed_sources readable by all" ON public.feed_sources;
CREATE POLICY "feed_sources readable by signed-in users" ON public.feed_sources
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.feed_sources FROM anon;
GRANT SELECT ON public.feed_sources TO authenticated;

DROP POLICY IF EXISTS "nse_disclosures readable by all" ON public.nse_disclosures;
CREATE POLICY "nse_disclosures readable by signed-in users" ON public.nse_disclosures
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.nse_disclosures FROM anon;
GRANT SELECT ON public.nse_disclosures TO authenticated;

DROP POLICY IF EXISTS "sebi_orders readable" ON public.sebi_orders;
CREATE POLICY "sebi_orders readable by signed-in users" ON public.sebi_orders
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.sebi_orders FROM anon;
GRANT SELECT ON public.sebi_orders TO authenticated;

DROP POLICY IF EXISTS "sebi_public_issues readable" ON public.sebi_public_issues;
CREATE POLICY "sebi_public_issues readable by signed-in users" ON public.sebi_public_issues
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.sebi_public_issues FROM anon;
GRANT SELECT ON public.sebi_public_issues TO authenticated;

DROP POLICY IF EXISTS "sebi_repo_sync readable" ON public.sebi_repo_sync;
CREATE POLICY "sebi_repo_sync readable by signed-in users" ON public.sebi_repo_sync
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.sebi_repo_sync FROM anon;
GRANT SELECT ON public.sebi_repo_sync TO authenticated;

DROP POLICY IF EXISTS "sync_runs readable by all" ON public.sync_runs;
CREATE POLICY "sync_runs readable by signed-in users" ON public.sync_runs
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.sync_runs FROM anon;
GRANT SELECT ON public.sync_runs TO authenticated;

-- Notifications: signed-in users only, and only ones they have not dismissed.
DROP POLICY IF EXISTS "notifications readable by authenticated" ON public.notifications;
CREATE POLICY "notifications readable by signed-in users" ON public.notifications
  FOR SELECT TO authenticated USING (
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_dismissals d
      WHERE d.notification_id = public.notifications.id
        AND d.user_id = auth.uid()
    )
  );
REVOKE ALL ON public.notifications FROM anon;
GRANT SELECT ON public.notifications TO authenticated;