CREATE TABLE public.outlook_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  source text NOT NULL DEFAULT 'contacts',
  job_title text,
  company text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);
CREATE INDEX outlook_contacts_user_name_idx ON public.outlook_contacts (user_id, name);
GRANT SELECT ON public.outlook_contacts TO authenticated;
GRANT ALL ON public.outlook_contacts TO service_role;
ALTER TABLE public.outlook_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own synced contacts" ON public.outlook_contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);