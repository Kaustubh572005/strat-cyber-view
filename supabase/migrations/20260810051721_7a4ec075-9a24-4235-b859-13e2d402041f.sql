CREATE TABLE public.presentation_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  audience TEXT,
  presentation_type TEXT,
  tone TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  content_rules TEXT[] NOT NULL DEFAULT '{}',
  instructions TEXT,
  controls JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX presentation_profiles_user_idx ON public.presentation_profiles (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presentation_profiles TO authenticated;
GRANT ALL ON public.presentation_profiles TO service_role;
ALTER TABLE public.presentation_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles owner all" ON public.presentation_profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_presentation_profiles_updated BEFORE UPDATE ON public.presentation_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();