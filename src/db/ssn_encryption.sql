-- =============================================================================
-- Decedent Social Security number encryption
--
-- WHY: cases.decedent_ssn_encrypted was a plain-text column. The family
-- portal's "Your Information" tab wrote SSNs straight into it unencrypted,
-- and nothing in the app could read them back. This makes the column
-- genuinely encrypted at rest, and gives staff exactly one audited way to
-- read a value.
--
-- HOW IT WORKS
--   * The key lives in Supabase Vault, not in the app or the browser.
--   * A trigger encrypts anything written to decedent_ssn_encrypted — so
--     EVERY writer (staff screens, the family-portal-update Edge Function,
--     anything added later) is covered without changing their code.
--   * get_decedent_ssn(case_id) is the only way to read a value back. It
--     checks the caller has access to that case's location and records the
--     view in the audit log.
--
-- RUN ORDER: run PART 1 first, on its own. Then PART 2. Then PART 3.
-- Do not delete or replace the vault secret afterwards — without that exact
-- key the stored numbers cannot be decrypted.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PART 1 — extensions and the encryption key (safe to re-run; will not
-- create a second key if one already exists)
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ssn_encryption_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ssn_encryption_key',
      'Encrypts decedent Social Security numbers. Do not delete or replace without re-encrypting every case.'
    );
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- PART 2 — functions and trigger
-- ---------------------------------------------------------------------------

-- Reads the key. Callable only by the functions below, never from the app.
create or replace function public.ssn_key()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ssn_encryption_key' limit 1
$$;
revoke all on function public.ssn_key() from public, anon, authenticated, service_role;


-- Encrypts on the way in. Raises an error rather than ever storing a value
-- unencrypted or silently dropping it if the key is missing.
create or replace function public.encrypt_decedent_ssn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  if new.decedent_ssn_encrypted is null or btrim(new.decedent_ssn_encrypted) = '' then
    new.decedent_ssn_encrypted := null;
  elsif new.decedent_ssn_encrypted not like 'enc:v1:%' then
    k := public.ssn_key();
    if k is null then
      raise exception 'SSN encryption key is not configured (vault secret ssn_encryption_key is missing)';
    end if;
    new.decedent_ssn_encrypted := 'enc:v1:' || encode(
      extensions.pgp_sym_encrypt(btrim(new.decedent_ssn_encrypted), k), 'base64'
    );
  end if;
  return new;
end;
$$;
revoke all on function public.encrypt_decedent_ssn() from public, anon, authenticated, service_role;

drop trigger if exists encrypt_decedent_ssn_trg on public.cases;
create trigger encrypt_decedent_ssn_trg
  before insert or update of decedent_ssn_encrypted on public.cases
  for each row execute function public.encrypt_decedent_ssn();


-- The one way to read a number back. Checks location access, logs the view.
create or replace function public.get_decedent_ssn(p_case_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
  k text;
begin
  if not exists (
    select 1 from public.cases c
    where c.id = p_case_id and public.has_location_access(c.location_id)
  ) then
    raise exception 'Not allowed';
  end if;

  select c.decedent_ssn_encrypted into v from public.cases c where c.id = p_case_id;
  if v is null then
    return null;
  end if;

  insert into public.audit_log (entity_type, entity_id, case_id, action, summary, changed_by)
  values ('case', p_case_id, p_case_id, 'view', 'Viewed the Social Security number', auth.uid());

  -- A value written before this migration and not yet converted: still readable.
  if v not like 'enc:v1:%' then
    return v;
  end if;

  k := public.ssn_key();
  if k is null then
    raise exception 'SSN encryption key is not configured (vault secret ssn_encryption_key is missing)';
  end if;
  return extensions.pgp_sym_decrypt(decode(substr(v, 8), 'base64'), k);
end;
$$;
revoke all on function public.get_decedent_ssn(uuid) from public, anon;
grant execute on function public.get_decedent_ssn(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- PART 3 — encrypt any numbers already stored in plain text, then verify
-- ---------------------------------------------------------------------------

-- Touching the column fires the trigger, which converts each plain value.
update public.cases
set decedent_ssn_encrypted = decedent_ssn_encrypted
where decedent_ssn_encrypted is not null
  and decedent_ssn_encrypted not like 'enc:v1:%';

-- Expect still_plaintext = 0.
select
  count(*) filter (where decedent_ssn_encrypted like 'enc:v1:%') as encrypted,
  count(*) filter (where decedent_ssn_encrypted is not null and decedent_ssn_encrypted not like 'enc:v1:%') as still_plaintext
from public.cases;
