# Casillas OS — Multi-Location Funeral Home Management (MVP)

A working prototype of a Passare/PlotBox-style case management system for
Casillas Funeral Home, built from the real designation sheet, GPL, and forms
Joel provided. Covers case management, chain-of-custody tracking, document
generation with real fillable forms, vendor order confirmation, scheduling
with conflict blocking, invoicing with an online checkout scaffold,
reporting, a TV-board whiteboard replacement, a full audit log, and
role/location/feature-level access control.

## Quick start

```bash
npm install
npm run dev
```

Open the printed localhost URL and log in. **No backend setup required** —
the app runs on an in-memory mutable store seeded with the real 4-location
roster and price list.

### Demo logins (real staff, placeholder passwords)

| Role | Name | Email | Password |
|---|---|---|---|
| Super Admin | Joel Casillas | `casillasjoel@live.com` | `qwerty` |
| Super Admin | Ashlie Torres | `ashlie.torres@casillasfuneralhome.com` | `demo1234` |
| Admin | Joseph Casillas | `joseph.casillas@casillasfuneralhome.com` | `demo1234` |
| Manager | Joe Galvan | `joe.galvan@casillasfuneralhome.com` | `demo1234` |
| Staff Member | Amber Lopez | `amber.lopez@casillasfuneralhome.com` | `demo1234` |

Full 18-person roster is in `src/data/mockData.ts`, matching the
designation sheet exactly (names, tiers, and per-location access). Emails
are placeholders (`firstname.lastname@casillasfuneralhome.com`) since real
ones weren't provided — swap them in before this goes live. **No real
employee's actual password is used anywhere** — every non-Joel account
shares an obvious placeholder on purpose.

> ⚠️ **This login is NOT secure and must not be used with real data.**
> Passwords are stored in plaintext in `mockData.ts` and shipped in the
> client-side JavaScript bundle. See "Connecting a real backend" below.

## What's built this pass

### Email inbox → case matching
- New "Email Inbox" nav item + `/inbox` review screen: emails from
  `info@casillasfuneralhome.com` matched to cases automatically (known
  contact) or held for a one-click staff confirmation (AI-suggested match
  from an unknown sender, or fully unmatched)
- Each case gets an "Emails" tab showing everything matched to it
- Full Microsoft Graph integration code written and ready
  (`supabase/functions/sync-inbox/`) — inactive until Supabase + Azure AD
  app registration are set up (see setup section below)

### E-signature (SignRequest)
- "Send for Signature" button appears once a form is generated in a case's
  Documents tab, plus a status tracker (sent/viewed/signed) per case
- The on-screen form is now actually converted to a real PDF
  (`src/lib/pdfGenerator.ts`, jsPDF + html2canvas, code-split so it doesn't
  load until someone sends a document) and uploaded to Supabase Storage
  before handing off to SignRequest — the gap flagged in an earlier pass is
  closed
- Full SignRequest API integration code written
  (`supabase/functions/send-signature-request/` and
  `supabase/functions/signrequest-webhook/`), deployable via the Supabase
  Dashboard's Edge Function editor — no CLI required. Inactive until
  deployed + a SignRequest Business API key is set (see setup section)

### Branding & real data
- Real transparent logo (extracted from `logo_cffh_vector.pdf`) used
  throughout: sidebar, login, family portal, invoices, generated forms
- Real addresses/phone/FD license numbers for Cathedral City, Desert Hot
  Springs, and Coachella (verified against the actual letterhead) — Eureka's
  are still placeholders
- Real General Price List from `1GPL_10012024.pdf`, applied to all 4
  locations (Eureka reuses the same figures as a placeholder pending real
  Eureka pricing)
- Real 18-person staff roster with exact role tiers and per-location access
  from the designation sheet, plus a `department` field (e.g. Leo Mejia,
  Hector Salas, David Escoto, and David Espinosa are tagged "Funeral
  Services" per your note)

### Login & access control (`src/lib/permissions.ts`)
- 5-tier hierarchy: Super Admin → Admin → Manager → Supervisor → Staff Member
- **Per-user access management** (Admin page, Super Admin only): beyond the
  role tiers, you can now click into any staff member and toggle their
  location access and individual feature access (Cases, Custody, Calendar,
  Financials, Reports, TV Board, Admin) on or off — so you could, for
  example, give someone Manager-level case access but explicitly block them
  from Financials
- Manager and above only: assigning staff/vehicles to calendar events (see
  Scheduling below)

### Case management
- Real create/edit forms, working task checklist, notes, document upload
- **Vendor order confirmation tracking** (new "Orders" tab per case):
  Flowers, Doves/Birds, Horse & Carriage, Motorcycle Escort, etc. — each
  tracked through Pending → Ordered → Confirmed with a timestamp, so you can
  see whether someone actually called and confirmed an order versus just
  requested it

### Real fillable forms (`src/components/documents/FormTemplates.tsx`)
Reproduces the exact text and layout of your actual documents, with the
real letterhead (all three locations + logo):
- Authorization for Release of Human Remains and Personal Property
- Authorization to Accept or Decline Embalming
- Disclosure of Preneed Funeral Agreement

Each is a live, editable form (not just auto-filled read-only text) with a
Print button that hides everything but the document.

**Not built — need the source documents:** the Death Certificate Control
Form and the form starting "This form contains the data…" weren't included
in what was uploaded (only `documents_Coachella8.pdf`, which covered the
three above, came through with the exact text). Send those two over and
they'll get built the same way.

### Chain of custody
- Drag-and-drop board, 7 stages (Scene/First Call → shipped/released)
- **Newest-first by default** in every column — including right after a
  drag-drop, since the sort key is "last moved," not "originally created"
  — plus a sort control (Newest / Oldest / Name A–Z)
- Full audit trail per case, viewable by clicking any card

### Scheduling (`src/pages/calendar/EventForm.tsx`)
- Real-time conflict detection against every other event
- **Staff double-booking is now a hard block** — can't be overridden, since
  a person genuinely can't be in two places. Vehicle conflicts stay
  soft/overridable (you might arrange a second vehicle)
- **Staff/vehicle assignment is now Manager-tier and above only** —
  Supervisors can still create/edit an event's time, title, and notes, but
  can't change who's assigned

### TV Board (`src/pages/board/TvBoard.tsx`, route `/board`)
Full-screen replacement for the physical whiteboard in the photo — same
columns (Name, Visitation, Service, Disp., Flowers, Birds, Escort, Casket),
auto-refreshes every 20 seconds, no sidebar chrome so it's clean to project
or screen-share. Flowers/Birds/Escort pull live from the Orders tab above.

### Audit log (`src/pages/admin/AdminPage.tsx`, Audit Log tab)
Every mutation in the app — case create/edit, task toggles, notes,
documents, custody moves, invoice payments, role/access changes, scheduling
— is now logged with who, what, and when. Visible to Admin tier and above.
This is the foundation; see "Connecting a real backend" for what it takes
to make this a genuinely tamper-evident record instead of an in-memory list.

### Financials / Invoicing
- Real GPL, contract line items now support a flat-dollar `discount` field
- Everything from the previous pass (print, paid/unpaid toggle, Stripe-style
  checkout scaffold in the family portal) is unchanged

## What's explicitly NOT done yet (by design, flagging clearly)

1. **DocuSign / e-signature integration** — the intake requirement (get
   documentation filled out and estimate prepared, sometimes emailed with
   e-signature) isn't wired up. This needs a real DocuSign/HelloSign API
   integration with a server-side component (API keys can't live in
   frontend code) — a genuinely separate project, not a checkbox.
2. **Click-to-build estimate/contract from the GPL** — the GPL now has real
   data and contracts support a discount field, but there's no UI yet to
   click through GPL items and assemble a new estimate from scratch. Right
   now editing existing contract data happens in the mock store, not
   through a form.
3. **Death Certificate Control Form + "This form contains the data…" form**
   — need the source documents (see above).
4. **Real-time TV board sync across devices** — the board auto-refreshes
   every 20 seconds via polling, which is fine for a lobby monitor but isn't
   instant push. True real-time (someone drags a custody card and the TV
   updates in under a second) needs Supabase Realtime subscriptions.

## Role permission matrix

| | View Dashboard/Cases/Custody/Calendar | Assign staff/vehicles to events | Edit cases/tasks/custody | Financials (view) | Financials (edit GPL) | Reports | TV Board | Invoices | Assign roles & access |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Super Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Supervisor | ✅ | — | ✅ | ✅ | — | — | ✅ | ✅ | — |
| Staff Member | — | — | — | — | — | — | — | ✅ (only screen) | — |

Any of the above can be further restricted per-person via the Admin page's
feature-access toggles (Super Admin only).

## Architecture

- **React 19 + Vite + TypeScript**, Tailwind v4, Recharts (lazy-loaded)
  for Reports
- **`src/lib/permissions.ts`** — every access-control decision in the app
  reads from here, including the new per-user override logic
  (`visibleNavKeys`) that layers `disabledFeatures` on top of role defaults
- **`src/data/mockStore.ts`** — in-memory mutable store; every mutation now
  also appends to an audit log entry via `logAudit()`. Resets on reload.
- **`src/lib/api.ts`** — unchanged pattern: checks `USE_MOCK`, routes to the
  mock store or Supabase. Every mutation now takes a `changedBy: StaffMember`
  argument for audit logging.

## Connecting a real backend (Supabase)

**Status: connected.** The Supabase project is live, the schema is
deployed, and `SessionContext.tsx` now uses real Supabase Auth instead of
the mock login — automatically, based on whether `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` are set in `.env.local`. With them set, the app
talks to Postgres for everything; without them, it falls back to the
in-browser mock store, which is still useful for demos and local UI work
without touching real data.

### One-time setup: seed the organization and real staff accounts

The database starts empty after running `schema.sql` — no locations, no
staff, no GPL. `scripts/seed-supabase.mjs` creates all of that in one run:
the organization, all 4 locations (real addresses/phones/license numbers;
Eureka's are still placeholders), all 18 real staff members as actual
Supabase Auth accounts, the real GPL applied to every location, and the
vehicle fleet. **It deliberately does not create any fake cases or
families** — that's demo-only data that has no place in a database real
people's information will eventually live in.

```bash
# In Supabase: Settings → API → copy the service_role key (NOT anon)
export SUPABASE_URL="https://kduvajnzussalxihgyfv.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="paste-it-here"
npm run seed:supabase
```

Run this from your own terminal — the service_role key bypasses every
security rule in the database, so it should never be pasted into a chat,
committed to git, or put in a `VITE_`-prefixed env var (which would ship it
to every browser that loads the app). Close the terminal or clear your
shell history afterward.

Every account except Joel's gets created with the password
`ChangeMe123!` — have each person change theirs on first login. (A
"you must reset your password" flow on first login would be a good
next addition rather than relying on everyone remembering to do it.)

### Remaining items

`src/db/schema.sql` includes: the `disabled_features` column and extended
role-change trigger (blocks non-super_admins from changing role *or*
feature access), a `department` column, `vehicles`, `service_orders`,
`inbound_emails`, and `signature_requests` tables, and an append-only
`audit_log` table.

- **Audit log integrity** — revoke UPDATE/DELETE grants on `audit_log` at
  the database-user level so it's genuinely append-only, not just "a table
  nobody happens to write to."
- **Payments** — still a UI scaffold; needs Stripe Elements + a server-side
  PaymentIntent via Supabase Edge Function before real money moves through
  it. See the comment block in `api.ts` above `recordOnlinePayment`.
- **Document storage** — uploads use `URL.createObjectURL()`, which only
  lives in the current tab and vanishes on reload. Swap for Supabase
  Storage.

## Create a case by uploading a document

New: **Cases → Upload Document** lets staff upload an existing intake form,
hospital paperwork, or invoice (PDF or image), and Claude reads it and
pre-fills a New Case form with whatever it finds — decedent name, dates,
disposition, contact info. Nothing is ever saved automatically; it always
routes through the normal case form for a staff member to review and
confirm, exactly like typing it in by hand, just with a head start.

### Setup (Supabase Dashboard, no CLI)

1. Deploy the function the same way as the others: **Edge Functions** →
   **Deploy a new function** → **Via Editor** → name it exactly
   `extract-case-data` → paste in the contents of
   `supabase/functions/extract-case-data/index.ts` → **Deploy**.
2. Set the secret (Edge Functions → Secrets): `ANTHROPIC_API_KEY` — the
   same key already used by `sync-inbox` for email matching, if that's set
   up; otherwise grab one from [console.anthropic.com](https://console.anthropic.com).
3. That's it — no webhook, no third-party account setup. Test by going to
   **Cases → Upload Document** and uploading any funeral-related PDF or
   photo.

Cost is genuinely small — this uses Claude Sonnet for better accuracy on
messy/handwritten documents than the Haiku model used for email matching,
but it's still a single request per upload, not a recurring cost.

## Email inbox setup (info@casillasfuneralhome.com → cases)

Code is fully written and ready — `src/pages/inbox/EmailInbox.tsx` for the
review UI, `supabase/functions/sync-inbox/` for the Microsoft Graph
polling + matching logic, `supabase/functions/email-attachment-action/`
for the per-attachment "Extract Info" / "Save to Case" choice. It runs on
mock data until you connect it. Setup:

1. **Register an Azure AD app** (Microsoft 365 admin center → Azure Active
   Directory → App registrations → New registration). Grant it the
   **application permission** `Mail.Read` (not delegated — this needs to
   run unattended, not as a logged-in user) and have an admin consent to it.
2. **Scope it to only the info@ mailbox**, not the whole tenant — use an
   Exchange application access policy
   (`New-ApplicationAccessPolicy` in Exchange PowerShell) restricting this
   app to `info@casillasfuneralhome.com` specifically. Skipping this step
   means the app can technically read *any* mailbox in the organization,
   which is far more access than this feature needs.
3. Set the Edge Function secrets: `MICROSOFT_TENANT_ID`,
   `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_MAILBOX`,
   `ANTHROPIC_API_KEY` (for AI-assisted matching of emails from unknown
   senders — cheap, uses Haiku).
4. Deploy `sync-inbox` via the Dashboard's Edge Function editor (same
   no-CLI method as the other functions).
5. Schedule it to run every few minutes (that function's page → add a Cron
   trigger).
6. Deploy a second function, **`email-attachment-action`**, the same way —
   this is what runs when a staff member picks "Extract Info" or "Save to
   Case" on one specific attachment (`supabase/functions/email-attachment-action/index.ts`).
   Uses the same secrets as `sync-inbox`, nothing new to set.
7. **If your database already has the older `inbound_emails` table** (i.e.
   you ran `schema.sql` before this update), run this migration in the SQL
   Editor — the `has_attachments` boolean was replaced with a real
   `attachments` list:
   ```sql
   alter table inbound_emails drop column if exists has_attachments;
   alter table inbound_emails add column if not exists attachments jsonb not null default '[]';
   ```

Matching logic: known case contacts auto-match by sender email; unknown
senders get an AI-suggested match that a staff member confirms in the
Email Inbox screen. Nothing is ever auto-filed without a human check —
misfiling something sensitive into the wrong family's case is exactly the
kind of mistake worth a few extra seconds of review to avoid.

## E-signature setup (SignRequest)

**Status: code complete on both ends.** `pdfFromElement()`
(`src/lib/pdfGenerator.ts`) converts the on-screen form into a real PDF,
uploads it to Storage, then calls the Edge Function — the gap flagged in
earlier notes is closed. What's left is deployment and credentials, all
doable through the Supabase **Dashboard** — no command line needed.

### 1. Create the storage bucket

Dashboard → **Storage** → **New bucket** → name it exactly `case-documents`
→ Private (not public) → Create.

### 2. Deploy the two Edge Functions (via the Dashboard editor, no CLI)

For each of `send-signature-request` and `signrequest-webhook`:

1. Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. Name it exactly `send-signature-request` (or `signrequest-webhook` for
   the second one)
3. Delete the placeholder template code, paste in the full contents of
   `supabase/functions/send-signature-request/index.ts` (or the webhook
   file for the second function)
4. Click **Deploy**

For `signrequest-webhook` specifically: after deploying, go to that
function's **Settings** and turn **off** "Verify JWT" — this endpoint is
called by SignRequest, not by a logged-in user, so it can't require a
Supabase session token.

### 3. Set the secrets

Dashboard → **Edge Functions** → **Manage secrets** (or **Settings** →
**Edge Functions**), add:
- `SIGNREQUEST_API_KEY` — from your SignRequest Business account settings
- `SIGNREQUEST_TEAM` — your SignRequest team subdomain
- `SIGNREQUEST_WEBHOOK_SECRET` — make up any random string yourself; it's
  just how the webhook function verifies a callback is really from
  SignRequest and not someone else hitting the URL

### 4. Point SignRequest at the webhook

In SignRequest's team settings → Integrations/Webhooks, set the URL to:
```
https://kduvajnzussalxihgyfv.supabase.co/functions/v1/signrequest-webhook?secret=<the SIGNREQUEST_WEBHOOK_SECRET you just set>
```

### 5. Test it

Open a case, generate one of the three real forms, click **Send for
Signature** (only visible once a form is generated and the primary
contact has an email on file). It should: turn the on-screen form into a
PDF, upload it, and hand off to SignRequest for real. The status tracker
on the case will show "sent" until SignRequest's webhook reports back
"signed."

At Casillas's volume (roughly 3 forms × 20–30 cases/month), expect **~$50–65/month**
in SignRequest API costs on top of the Business plan subscription — see the
per-document pricing on SignRequest's site for current rates.

## Deploying

Unchanged from before — `netlify.toml` for Netlify, `vercel.json` for
Vercel, `wrangler.jsonc` for Cloudflare (currently blocked by an
[open Cloudflare bug](https://github.com/cloudflare/workers-sdk/issues/11824),
use Netlify or Vercel until that's patched).

```bash
npm run build
```

Remember to set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as
environment variables in whichever platform's dashboard once you're on a
real backend — never commit them to the repo.
