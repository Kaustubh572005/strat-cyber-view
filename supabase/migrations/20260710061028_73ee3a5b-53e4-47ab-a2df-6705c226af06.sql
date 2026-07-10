
CREATE POLICY "pptx templates read own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'pptx-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pptx templates insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pptx-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pptx templates update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'pptx-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pptx templates delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'pptx-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
