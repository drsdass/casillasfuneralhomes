-- ============================================================================
-- Funeral OS — Multi-Location Case Management Schema (Supabase / Postgres)
-- ============================================================================
-- Run this in the Supabase SQL editor on a fresh project.
-- Enforces location-level data isolation via Row Level Security so that
-- staff only see cases/financials/events for locations they're assigned to,
-- while admin/super_admin roles see everything in their organization.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Organizations & Locations
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  timezone text default 'America/Los_Angeles',
  license_number text,
  active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Staff (extends Supabase auth.users via profile table)
-- ---------------------------------------------------------------------------

-- Permission tier — ranked highest to lowest. Separate from `title` (job
-- title like "Funeral Director"), which is descriptive only.
create type user_role as enum (
  'super_admin', 'admin', 'manager', 'supervisor', 'staff_member'
);

create table staff_members (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text not null,
  role user_role not null default 'staff_member',
  title text,
  department text, -- job grouping (e.g. "Funeral Services") — not a permission, just organizational
  phone text,
  avatar_color text,
  active boolean not null default true,
  -- Features explicitly disabled for this person, overriding their role
  -- default. Only super_admin can write to this column (see trigger below).
  disabled_features text[] not null default '{}'
);

-- Only super_admin may change another user's role OR their disabled_features
-- (both are access-control changes). RLS alone can't easily enforce
-- column-level restrictions, so this trigger blocks the update at the
-- database layer regardless of what the application does.
create or replace function enforce_role_change_permission()
returns trigger language plpgsql security definer as $$
begin
  if new.role is distinct from old.role or new.disabled_features is distinct from old.disabled_features then
    -- auth.uid() is only set for requests coming through the app itself
    -- (a real logged-in user's session). Direct SQL Editor work, migrations,
    -- and service-role Edge Function calls have no such session and
    -- auth.uid() reads as null — those are trusted admin contexts already,
    -- so this only needs to block a logged-in non-super_admin from using
    -- the app's own API to change someone's role.
    if auth.uid() is not null and not exists (
      select 1 from staff_members
      where id = auth.uid() and org_id = old.org_id and role = 'super_admin'
    ) then
      raise exception 'Only a super_admin can change a user''s role or feature access.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_role_change
  before update on staff_members
  for each row execute function enforce_role_change_permission();

create table staff_locations (
  staff_id uuid not null references staff_members(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  primary key (staff_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------

create type case_status as enum (
  'first_call', 'arrangement_pending', 'arrangement_scheduled',
  'in_progress', 'service_scheduled', 'completed', 'on_hold'
);
create type case_type as enum ('at_need', 'pre_need', 'transfer_only');
create type disposition_type as enum ('burial', 'cremation', 'entombment', 'donation', 'undetermined');
create type custody_stage as enum (
  'scene_first_call', 'in_transit', 'funeral_home', 'chapel_service',
  'crematory', 'ashes_received', 'cemetery_burial', 'shipped_released', 'completed'
);

-- ============================================================================
-- Family CRM — a family persists across every case they've ever been
-- served for. Org-wide, not location-scoped: the same family might be
-- served at a different Casillas location years apart.
-- ============================================================================

create table families (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_email text,
  notes text, -- preferences, religion, special considerations
  created_at timestamptz not null default now()
);

create type family_interaction_type as enum ('thank_you_sent', 'grief_support', 'anniversary_outreach', 'referral', 'community_event', 'other');

create table family_interactions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  type family_interaction_type not null default 'other',
  notes text not null,
  created_by uuid references staff_members(id),
  created_at timestamptz not null default now()
);

create table cases (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  family_id uuid references families(id) on delete set null,
  case_number text not null,
  type case_type not null default 'at_need',
  status case_status not null default 'first_call',
  disposition disposition_type not null default 'undetermined',

  -- decedent (flattened; move to separate table if you need multiple decedents/case)
  decedent_first_name text not null,
  decedent_middle_name text,
  decedent_last_name text not null,
  decedent_dob date,
  decedent_dod date,
  decedent_place_of_death text,
  decedent_ssn_encrypted text, -- encrypt at application layer before insert
  decedent_sex text,
  decedent_marital_status text,
  decedent_veteran boolean default false,

  -- Everything captured on the First Call sheet that doesn't already have
  -- a home elsewhere on this table — one JSONB blob rather than ~18 new
  -- columns for a well-defined, always-read/written-together field set.
  -- See FirstCallInfo in src/types/index.ts for the exact shape.
  first_call jsonb,
  vital_sheet jsonb,
  -- Fields a family submitted via their portal link that conflicted with
  -- an already-set value (e.g. First Call) — flagged instead of silently
  -- overwritten. See FieldDiscrepancy in src/types/index.ts.
  field_discrepancies jsonb,

  assigned_director_id uuid references staff_members(id),
  assigned_embalmer_id uuid references staff_members(id),
  visitation_date timestamptz,
  visitation_location text,
  service_date timestamptz,
  service_location text,
  color text,
  custody_stage custody_stage not null default 'scene_first_call',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (location_id, case_number)
);

create table case_contacts (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  name text not null,
  relationship text,
  phone text,
  email text,
  is_primary boolean default false,
  is_authorizing_agent boolean default false
);

create table case_tasks (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  label text not null,
  category text not null default 'other',
  status order_status not null default 'pending',
  due_date date,
  assigned_to uuid references staff_members(id),
  -- Set when this task was auto-created from a vendor Order — its status
  -- is kept in sync with that order's in both directions. FK added after
  -- service_orders is defined further below (it doesn't exist yet here).
  linked_order_id uuid
);

-- The standard checklist every new case is seeded from. Editing this
-- later doesn't retroactively change tasks already created on existing
-- cases — each case's tasks are its own independent copy from the moment
-- it was created.
create table task_templates (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  label text not null,
  category text not null default 'other',
  days_until_due integer,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table case_notes (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  author_id uuid references staff_members(id),
  body text not null,
  pinned boolean default false,
  created_at timestamptz not null default now()
);

create table case_documents (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  storage_path text not null, -- Supabase Storage object path
  uploaded_by uuid references staff_members(id),
  uploaded_at timestamptz not null default now(),
  signed boolean default false
);

-- ---------------------------------------------------------------------------
-- Chain of Custody
-- ---------------------------------------------------------------------------
-- Append-only audit trail. In production, revoke UPDATE/DELETE grants on
-- this table entirely (only INSERT + SELECT) since it's the legal record of
-- who had custody of a decedent and when.

create table custody_log (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  from_stage custody_stage,
  to_stage custody_stage not null,
  moved_by uuid references staff_members(id),
  note text,
  timestamp timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Financials
-- ---------------------------------------------------------------------------

create table gpl_items (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  sku text,
  name text not null,
  category text not null default 'service',
  price numeric(10,2) not null default 0,
  taxable boolean default true,
  active boolean default true
);

create type contract_status as enum ('draft', 'sent', 'signed', 'paid', 'void');

create table contracts (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  status contract_status not null default 'draft',
  subtotal numeric(10,2) not null default 0,
  tax_total numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0, -- flat dollar amount, applied to subtotal before tax
  total numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  -- Manual paid/unpaid toggle, distinct from `status` (document lifecycle).
  -- This is the field the staff_member print/pay screen reads and flips.
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  signed_at timestamptz
);

create table contract_line_items (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references contracts(id) on delete cascade,
  gpl_item_id uuid references gpl_items(id),
  -- Set only for line items that came from a vendor Order (Flowers, Escort,
  -- etc.) with a price — lets the sync logic find/update/remove the
  -- matching invoice line when that order changes, without touching
  -- line items a staff member added by hand from the GPL.
  service_order_id uuid references service_orders(id) on delete cascade,
  name text not null,
  quantity numeric(6,2) not null default 1,
  unit_price numeric(10,2) not null default 0,
  -- Per-line discount (negative) or increase (positive) — the "family
  -- starts taking things off" adjustment, applied on top of unit_price
  -- without losing the original list price for reference.
  adjustment_amount numeric(10,2) not null default 0
);

create type payment_method as enum ('cash', 'check', 'credit_card', 'ach', 'insurance_assignment', 'financing');

create table payments (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references contracts(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  amount numeric(10,2) not null,
  method payment_method not null,
  reference text,
  received_at timestamptz not null default now(),
  recorded_by uuid references staff_members(id)
);

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------

create type vehicle_type as enum ('hearse', 'van', 'limousine', 'other');

create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  type vehicle_type not null default 'other',
  active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Staff time off — vacation/sick/other unavailability. Shown on the
-- dedicated Staff Schedule page and layered onto the Calendar's staff
-- panel (soft warning when dragging someone onto an event during their
-- marked-off time — not a hard block, since real life sometimes needs an
-- exception).
-- ---------------------------------------------------------------------------

create type time_off_type as enum ('vacation', 'sick', 'other_off');

create table staff_time_off (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references staff_members(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  type time_off_type not null default 'other_off',
  notes text,
  created_by uuid references staff_members(id),
  created_at timestamptz not null default now(),
  constraint staff_time_off_valid_range check (end_date >= start_date)
);

create table calendar_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  case_id uuid references cases(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  title text not null,
  type text not null default 'other',
  start_at timestamptz not null,
  end_at timestamptz not null,
  location_text text,
  notes text
);

create table event_participants (
  event_id uuid not null references calendar_events(id) on delete cascade,
  staff_id uuid not null references staff_members(id) on delete cascade,
  primary key (event_id, staff_id)
);

-- ---------------------------------------------------------------------------
-- Vendor / item order confirmation tracking (flowers, carriage, escorts...)
-- ---------------------------------------------------------------------------

-- Shared by both service_orders and case_tasks (see case_tasks below) —
-- 'confirmed' displays as "Completed" in the UI.
create type order_status as enum ('pending', 'ordered', 'delivered', 'confirmed');

create table service_orders (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  item text not null,
  status order_status not null default 'pending',
  price numeric(10,2), -- what this line item costs; drives the running quote total on the Orders tab
  vendor text,
  notes text,
  ordered_by uuid references staff_members(id),
  ordered_at timestamptz,
  confirmed_by uuid references staff_members(id),
  confirmed_at timestamptz
);

alter table case_tasks add constraint case_tasks_linked_order_id_fkey
  foreign key (linked_order_id) references service_orders(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Audit log — append-only. Revoke UPDATE/DELETE grants in production; this
-- table should only ever grow.
-- ---------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null,
  entity_id uuid not null,
  case_id uuid references cases(id) on delete set null,
  action text not null,
  summary text not null,
  changed_by uuid references staff_members(id),
  timestamp timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Inbound email → case matching
-- ---------------------------------------------------------------------------
-- Populated by the sync-inbox Edge Function (supabase/functions/sync-inbox/),
-- which polls info@casillasfuneralhome.com via Microsoft Graph. Never
-- written to directly by the frontend except to confirm/ignore a match.

create type email_match_status as enum ('auto_matched', 'suggested', 'unmatched', 'confirmed', 'ignored');

create table inbound_emails (
  id uuid primary key default uuid_generate_v4(),
  graph_message_id text not null unique, -- Microsoft Graph message ID, prevents duplicate inserts on re-poll
  from_address text not null,
  from_name text,
  subject text not null,
  preview text,
  received_at timestamptz not null,
  case_id uuid references cases(id) on delete set null,
  match_status email_match_status not null default 'unmatched',
  match_confidence numeric(3,2), -- 0.00-1.00, for AI-suggested matches
  match_reason text,
  -- Attachment metadata only (filename, content type, size) — never the
  -- file content itself. Actual bytes are fetched from Microsoft Graph on
  -- demand, per attachment, only when a staff member chooses to either
  -- extract info from it or save it to the case (see the
  -- email-attachment-action Edge Function).
  attachments jsonb not null default '[]',
  confirmed_by uuid references staff_members(id),
  confirmed_at timestamptz
);

-- Small key-value table the sync-inbox function uses to remember how far
-- it's already synced, so re-runs don't re-fetch the whole mailbox history.
create table sync_state (
  key text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- E-signature requests (SignRequest API)
-- ---------------------------------------------------------------------------

create type signature_request_status as enum ('draft', 'sent', 'viewed', 'signed', 'declined', 'expired');

create table signature_requests (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  document_name text not null,
  sign_request_id text, -- SignRequest's own document UUID, once sent
  status signature_request_status not null default 'draft',
  signer_name text not null,
  signer_email text not null,
  sent_by uuid references staff_members(id),
  sent_at timestamptz,
  signed_at timestamptz,
  signed_document_url text
);

-- ---------------------------------------------------------------------------
-- Family Portal
-- ---------------------------------------------------------------------------

create table family_portal_links (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  contact_id uuid references case_contacts(id),
  token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_accessed_at timestamptz
);

create table obituary_drafts (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  body text,
  photo_urls text[] default '{}',
  status text not null default 'draft',
  updated_at timestamptz not null default now()
);

-- Both tables previously had NO row level security at all — meaning
-- anyone with any Supabase client access (not just the person holding one
-- specific token) could list every family's link and token. Fixed: staff
-- can manage these normally (scoped to cases they have location access
-- to); there is deliberately NO policy granting the public/anon role any
-- access whatsoever. A family member's browser only ever talks to the
-- family-portal-data Edge Function (supabase/functions/family-portal-data/),
-- which validates their one token server-side using the service role
-- (bypassing RLS deliberately, in a narrow, controlled way) and returns
-- only that one case's data — never table access, never browsing.
alter table family_portal_links enable row level security;
alter table obituary_drafts enable row level security;

create policy "family_portal_links_staff" on family_portal_links for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
create policy "obituary_drafts_staff" on obituary_drafts for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Strategy: every location-scoped table checks that the requesting user
-- (auth.uid()) is either an admin/super_admin for that org (full org-wide
-- access), OR has a staff_locations row linking them to that specific
-- location.

alter table organizations enable row level security;
alter table locations enable row level security;
alter table staff_members enable row level security;
alter table staff_locations enable row level security;
alter table families enable row level security;
alter table family_interactions enable row level security;
alter table cases enable row level security;
alter table case_contacts enable row level security;
alter table case_tasks enable row level security;
alter table case_notes enable row level security;
alter table case_documents enable row level security;
alter table custody_log enable row level security;
alter table gpl_items enable row level security;
alter table contracts enable row level security;
alter table contract_line_items enable row level security;
alter table payments enable row level security;
alter table calendar_events enable row level security;
alter table event_participants enable row level security;
alter table vehicles enable row level security;
alter table staff_time_off enable row level security;
alter table service_orders enable row level security;
alter table audit_log enable row level security;
alter table inbound_emails enable row level security;
alter table signature_requests enable row level security;
alter table sync_state enable row level security; -- no policies: only the service role (Edge Functions) should ever touch this

-- Helper: is the current user an admin or super_admin of the given org?
-- (org-wide access — matches canViewAllLocations() in the frontend)
create or replace function is_org_admin(check_org_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from staff_members
    where id = auth.uid() and org_id = check_org_id and role in ('admin', 'super_admin')
  );
$$;

-- Helper: does the current user have access to the given location?
create or replace function has_location_access(check_location_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from staff_locations sl
    join staff_members sm on sm.id = sl.staff_id
    where sl.staff_id = auth.uid() and sl.location_id = check_location_id
  )
  or exists (
    select 1 from staff_members sm
    join locations l on l.org_id = sm.org_id
    where sm.id = auth.uid() and l.id = check_location_id and sm.role in ('admin', 'super_admin')
  );
$$;

-- Locations: visible if admin/super_admin or specifically assigned
create policy "locations_select" on locations for select
  using (is_org_admin(org_id) or has_location_access(id));

-- Cases: full CRUD gated on location access
create policy "cases_select" on cases for select using (has_location_access(location_id));
create policy "cases_insert" on cases for insert with check (has_location_access(location_id));
create policy "cases_update" on cases for update using (has_location_access(location_id));
create policy "cases_delete" on cases for delete using (is_org_admin(org_id));

-- Child tables inherit access through their parent case's location
create policy "case_contacts_all" on case_contacts for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
create policy "case_tasks_all" on case_tasks for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
create policy "case_notes_all" on case_notes for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
create policy "case_documents_all" on case_documents for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));

-- Chain of custody — readable/insertable by anyone with location access to
-- the parent case. As noted above, revoke UPDATE/DELETE grants on this
-- table in production so the audit trail can only ever grow.
create policy "custody_log_select" on custody_log for select
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
create policy "custody_log_insert" on custody_log for insert
  with check (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));

-- Financials
create policy "gpl_items_select" on gpl_items for select using (has_location_access(location_id));
create policy "gpl_items_write" on gpl_items for all using (has_location_access(location_id));
create policy "contracts_all" on contracts for all using (has_location_access(location_id));
create policy "contract_line_items_all" on contract_line_items for all
  using (exists (select 1 from contracts c where c.id = contract_id and has_location_access(c.location_id)));
create policy "payments_all" on payments for all
  using (exists (select 1 from contracts c where c.id = contract_id and has_location_access(c.location_id)));

-- Scheduling
create policy "calendar_events_all" on calendar_events for all using (has_location_access(location_id));
create policy "event_participants_all" on event_participants for all
  using (exists (select 1 from calendar_events e where e.id = event_id and has_location_access(e.location_id)));
create policy "vehicles_all" on vehicles for all using (has_location_access(location_id));

-- Vendor / item order confirmation tracking
create policy "service_orders_all" on service_orders for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));

-- Audit log — readable by anyone with location access to the related case;
-- org-wide entries (role/access changes) readable by admin+ only. Revoke
-- UPDATE/DELETE grants at the database-user level in production.
create policy "audit_log_select" on audit_log for select
  using (
    (case_id is not null and exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
    or exists (select 1 from staff_members where id = auth.uid() and role in ('admin', 'super_admin'))
  );
create policy "audit_log_insert" on audit_log for insert with check (true);

-- Inbound emails — readable/writable by anyone with location access to the
-- matched case. Rows with no case_id yet (unmatched) are visible to anyone
-- who can edit cases at all, since matching them is the whole point of the
-- review queue; adjust if you want this scoped tighter by location.
create policy "inbound_emails_select" on inbound_emails for select
  using (
    case_id is null
    or exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id))
  );
create policy "inbound_emails_update" on inbound_emails for update
  using (
    case_id is null
    or exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id))
  );
-- No insert policy for authenticated users — only the sync-inbox Edge
-- Function (service role, which bypasses RLS) should create these rows.

-- Signature requests — same location-access pattern as everything else.
create policy "signature_requests_select" on signature_requests for select
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
create policy "signature_requests_insert" on signature_requests for insert
  with check (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
-- No update policy for authenticated users — status changes (signed,
-- declined, etc.) come from the signrequest-webhook Edge Function only.

-- Helper: the current user's own org_id, looked up without going through
-- staff_members' own RLS policies (security definer bypasses RLS for this
-- specific, narrow lookup). Referencing staff_members directly inside a
-- staff_members policy — as an earlier version of this schema did — causes
-- "infinite recursion detected in policy" errors, since checking the
-- policy for any row requires re-running the same policy to resolve the
-- subquery. This function breaks that loop.
create or replace function current_user_org_id()
returns uuid language sql security definer stable as $$
  select org_id from staff_members where id = auth.uid();
$$;

-- Families — org-wide visibility (same reasoning as staff visibility: a
-- family might be served at a different location years apart, so this
-- isn't scoped per-location like cases are).
create policy "families_all" on families for all
  using (org_id = current_user_org_id());
create policy "family_interactions_all" on family_interactions for all
  using (exists (select 1 from families f where f.id = family_id and f.org_id = current_user_org_id()));

alter table task_templates enable row level security;
create policy "task_templates_all" on task_templates for all
  using (org_id = current_user_org_id());

-- Staff time off — anyone in the org can see everyone's status (needed for
-- the shared schedule view); only Manager tier and above can mark someone
-- as off, matching the same tier that can assign staff to events.
create policy "staff_time_off_select" on staff_time_off for select
  using (exists (select 1 from staff_members sm where sm.id = staff_time_off.staff_id and sm.org_id = current_user_org_id()));
create policy "staff_time_off_insert" on staff_time_off for insert
  with check (exists (select 1 from staff_members where id = auth.uid() and role in ('manager', 'admin', 'super_admin')));
create policy "staff_time_off_delete" on staff_time_off for delete
  using (exists (select 1 from staff_members where id = auth.uid() and role in ('manager', 'admin', 'super_admin')));

-- Staff visibility: staff can see other staff in orgs/locations they share
create policy "staff_members_select" on staff_members for select
  using (org_id = current_user_org_id());

-- Anyone in the org can attempt an update (e.g. editing their own phone
-- number); the trg_enforce_role_change trigger above is what actually
-- blocks non-super_admins from changing the `role` column.
create policy "staff_members_update" on staff_members for update
  using (org_id = current_user_org_id())
  with check (org_id = current_user_org_id());

-- staff_locations had RLS enabled but no policies at all in an earlier
-- version of this schema — Postgres's default with RLS on and zero
-- policies is to block everything for non-service-role connections. That
-- meant the app itself could never read a staff member's own location
-- assignments client-side (even though the has_location_access() /
-- is_org_admin() security-definer functions could see them fine
-- internally), which broke location-scoped inserts from the UI. Fixed:
create policy "staff_locations_select" on staff_locations for select
  using (
    staff_id = auth.uid()
    or exists (select 1 from staff_members sm where sm.id = staff_locations.staff_id and sm.org_id = current_user_org_id())
  );
create policy "staff_locations_insert" on staff_locations for insert
  with check (exists (select 1 from staff_members where id = auth.uid() and role = 'super_admin'));
create policy "staff_locations_delete" on staff_locations for delete
  using (exists (select 1 from staff_members where id = auth.uid() and role = 'super_admin'));

-- Note: family_portal_links / obituary_drafts DO now have staff RLS
-- policies (added further up, alongside their table definitions) — staff
-- can manage them normally. The public/family side never touches these
-- tables directly at all; see family-portal-data Edge Function.

-- ============================================================================
-- Storage — case-documents bucket
-- ============================================================================
-- The bucket itself (create manually via Dashboard → Storage → New bucket,
-- name "case-documents", Private) has no access rules of its own — Storage
-- access is governed by RLS on the `storage.objects` table, same as any
-- other table, and this was missing entirely, which silently blocked every
-- upload (document uploads, and the PDF generated before sending something
-- for e-signature) before it ever reached the app's own logic.
--
-- This is intentionally broad for now — any authenticated staff member can
-- read/write any file in the bucket, regardless of which location the file
-- belongs to. Given every other table already scopes access by location,
-- tightening this later (e.g. checking the case's location against the
-- caller, by parsing the case_id out of the storage path) is worth doing
-- before this handles a large multi-location file volume, but isn't a
-- blocker for getting uploads working at all right now.
create policy "case_documents_bucket_all" on storage.objects for all
  using (bucket_id = 'case-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'case-documents' and auth.role() = 'authenticated');

-- ============================================================================
-- Internal staff chat — supports 1:1 and group conversations. A message
-- belongs to a conversation; a conversation has one or more participants.
-- Live via Supabase Realtime while people are in the app.
-- ============================================================================

create table chat_conversations (
  id uuid primary key default uuid_generate_v4(),
  name text, -- set for a named group chat; null for 1:1 (the other person's name is shown instead)
  is_group boolean not null default false,
  created_by uuid references staff_members(id),
  created_at timestamptz not null default now()
);

create table chat_participants (
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  staff_id uuid not null references staff_members(id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, staff_id)
);

create table chat_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  sender_id uuid not null references staff_members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create or replace function is_chat_participant(conv_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from chat_participants where conversation_id = conv_id and staff_id = auth.uid());
$$;

alter table chat_conversations enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;

create policy "chat_conversations_select" on chat_conversations for select
  using (is_chat_participant(id));
create policy "chat_conversations_insert" on chat_conversations for insert
  with check (created_by = auth.uid());

create policy "chat_participants_select" on chat_participants for select
  using (is_chat_participant(conversation_id));
-- Whoever created the conversation can add its participants (needed to add
-- everyone else when starting a group); a person can also add themselves.
create policy "chat_participants_insert" on chat_participants for insert
  with check (
    staff_id = auth.uid()
    or exists (select 1 from chat_conversations c where c.id = conversation_id and c.created_by = auth.uid())
  );
create policy "chat_participants_update" on chat_participants for update
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

create policy "chat_messages_select" on chat_messages for select
  using (is_chat_participant(conversation_id));
create policy "chat_messages_insert" on chat_messages for insert
  with check (sender_id = auth.uid() and is_chat_participant(conversation_id));

-- Realtime is opt-in per table in Supabase — this is what makes new
-- messages show up live instead of needing a page refresh or manual poll.
alter publication supabase_realtime add table chat_messages;

-- ============================================================================
-- Vendor directory — external parties documents get sent to. Org-wide,
-- same reasoning as families: the same vendor often serves every location.
-- ============================================================================

create type vendor_category as enum ('removal_company', 'crematory', 'cemetery', 'florist', 'doctor_office', 'hospice', 'church', 'printing', 'other');

create table vendors (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category vendor_category not null default 'other',
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

alter table vendors enable row level security;
create policy "vendors_all" on vendors for all
  using (org_id = current_user_org_id());
