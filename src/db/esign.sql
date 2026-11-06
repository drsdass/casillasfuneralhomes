-- E-signature built into the OS: a family member opens a private link (or signs on a tablet), reads the document and signs.
-- Run once in the Supabase SQL editor. (Safe to run again.)
alter table signature_requests add column if not exists mode text not null default 'email';        -- 'email' (link) | 'inperson' (tablet)
alter table signature_requests add column if not exists document_path text;                         -- the PDF that was sent (in the case-documents bucket)
alter table signature_requests add column if not exists token text;                                  -- the secret in the signing link
alter table signature_requests add column if not exists expires_at timestamptz;
alter table signature_requests add column if not exists viewed_at timestamptz;
alter table signature_requests add column if not exists signed_name text;                            -- the name they typed when signing
alter table signature_requests add column if not exists signer_ip text;
alter table signature_requests add column if not exists signer_agent text;
alter table signature_requests add column if not exists document_sha256 text;                        -- fingerprint of the PDF that was shown
alter table signature_requests add column if not exists embed_url text;
alter table signature_requests add column if not exists external_ref text;
create unique index if not exists signature_requests_token_idx on signature_requests (token) where token is not null;
notify pgrst, 'reload schema';
