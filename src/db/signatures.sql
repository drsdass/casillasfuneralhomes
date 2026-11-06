-- E-signature (SignRequest): lets a request be signed in the office on a tablet, and keeps the page to reopen.
-- Run this once in the Supabase SQL editor.
alter table signature_requests add column if not exists mode text not null default 'email';   -- 'email' | 'inperson'
alter table signature_requests add column if not exists embed_url text;                         -- the in-office signing page
alter table signature_requests add column if not exists external_ref text;
alter table signature_requests add column if not exists document_path text;                     -- the PDF that was sent
notify pgrst, 'reload schema';
