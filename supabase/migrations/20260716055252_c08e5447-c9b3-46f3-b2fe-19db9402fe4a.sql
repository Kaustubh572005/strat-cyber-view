INSERT INTO public.feed_sources (source_key, display_name, category)
VALUES ('uti-amc-cyber', 'UTI AMC Cyber Watch', 'cybersecurity')
ON CONFLICT (source_key) DO UPDATE SET display_name = EXCLUDED.display_name, category = EXCLUDED.category;