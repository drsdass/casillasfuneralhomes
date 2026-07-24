# Casillas OS — Roadmap

Running list of what's built, what's in progress, and what's planned. Update
this file as items move between sections — it's the source of truth, not
any single conversation.

## ✅ Built

- Login & 5-tier role system (Super Admin/Admin/Manager/Supervisor/Staff
  Member), per-user location + feature access overrides
- Real Supabase backend: auth, database, RLS, real staff roster, real GPL
- Case management: create/edit, tasks, notes, documents, financials tab
- Chain of custody drag-and-drop board (cases between stages), newest-first
  sorting, full audit trail
- Scheduling: staff/vehicle assignment via checkboxes (Manager+ only),
  automatic conflict detection (staff conflicts hard-blocked, vehicle
  conflicts soft-warned)
- Vendor order confirmation tracking (Flowers/Birds/Escort/etc.,
  Pending → Ordered → Confirmed)
- Real fillable forms (Release of Remains, Embalming Authorization, Preneed
  Disclosure) with real letterhead, matching Casillas's actual documents
- Invoicing: real GPL, print, paid/unpaid toggle, restricted Staff Member view
- Reporting dashboard (revenue, case volume, disposition/status breakdowns)
- TV Board — full-screen whiteboard replacement for the office monitor
- Audit log — every mutation across the app, who/what/when
- Email inbox → case matching (info@casillasfuneralhome.com via Microsoft
  Graph, known-contact auto-match + AI-suggested match with human review)
- E-signature (SignRequest) — send real documents for signature, webhook
  updates status when signed
- **Upload document → create case** — Claude reads an intake form/hospital
  paperwork/existing invoice and pre-fills a New Case form for review
- **Per-attachment choice on matched emails** — "Extract Info" (Claude
  reads it, shows fields for manual review — never auto-applies) or "Save
  to Case" (just stores the file, no AI). Choice is per-document, not
  per-email — attachment content is only ever fetched from Microsoft Graph
  at the moment staff pick one of these two actions for that one file.
- **Drag-and-drop staff scheduling** — a "Staff" panel on the Calendar
  page (Manager+ only) lets you drag a name directly onto an event to
  assign them, or click the small × on an avatar to remove them — faster
  than opening the full event form for a quick change. Same hard-block
  rule as the form: a staff double-booking can't be dropped through,
  checked live against every other event before the assignment sticks.
- **Case dates auto-sync to the Calendar** — setting a Visitation or
  Service date/time on a case now automatically creates (or updates, or
  removes if cleared) a matching calendar event — no separate manual step.
  Default durations (2h visitation, 1h service) are a starting point; edit
  the individual event afterward if a case runs longer.
- **Real scheduling conflict detection** — this was previously a stub that
  always returned "no conflicts" for the live database (only worked in
  demo/mock mode). Now checks real overlapping events for both staff and
  vehicles.
- **Staff Schedule page** (`/staff-schedule`) — a grid of every staff
  member against days (week or month view, navigate forward/back), showing
  Vacation/Sick/Off status. Manager+ can click any empty cell to mark
  someone off through a date range; click an existing entry to remove it.
  Synced with the Calendar: the staff panel there shows a small dot on
  anyone with time off in the currently-viewed month, and dragging someone
  onto an event during their time off still works but shows a warning
  instead of silently doing nothing.
- **Calendar: Month/List view toggle + multi-month navigation** — List is
  the original day-grouped view; Month is a traditional grid with event
  chips per day. Both respect the same prev/next-month controls, so a
  service scheduled a few months out is just a few clicks away instead of
  scrolling an unbounded list.
- **Internal staff chat** (`/messages`) — real direct AND group messages,
  live via Supabase Realtime while people are in the app (no refresh
  needed). "New Message" lets you select one person for a 1:1 or several
  for a named group; group threads show who said what. Unread badge in
  the sidebar. This is genuinely live chat, not a notification feed —
  separate from the Slack piece below.
- **Message notifications** — a new message always shows an in-app pop-up
  toast (bottom-right, click to jump to the conversation), plays a short
  synthesized chime (no audio file to host — generated with the Web Audio
  API), and additionally fires a real OS-level notification when the
  browser tab isn't focused and the user has granted permission. Sound can
  be muted per-device (speaker icon in the header, saved to that browser)
  — the pop-up itself always shows regardless of the sound setting or
  notification permission.
- **Slack notifications** — new case created, custody stage changed, staff
  marked off, and a document getting signed all post automatically into a
  Slack channel. This is for *awareness of system activity*, not a
  replacement for real staff-to-staff chat (use Messages above, or Slack
  itself, for that).
- **Family Portal — actually secured, and now a real "tracking" experience**
  — this was a bigger fix than it sounds. The "Generate Family Portal
  Link" button never did anything before; it's now wired to create a real,
  hard-to-guess token. More importantly: the portal URL used to be the raw
  case ID, and `family_portal_links`/`obituary_drafts` had no row-level
  security at all — meaning the token system wasn't actually protecting
  anything. Fixed by adding proper RLS (staff-only table access) and
  building a dedicated Edge Function (`family-portal-data`) that's the
  *only* way a family member's browser ever touches case data — it
  validates their one token server-side and returns just that case,
  never table access. On top of that: the portal now shows a soft,
  translated status message ("Your loved one has arrived safely at our
  care facility...") based on the case's custody stage — the Amazon/Domino's
  tracker idea from the funeral-home-OS document.
- **Arrival notification (SMS)** — when a case's custody stage moves to
  "funeral home," the primary contact automatically gets a text with that
  same soft, reassuring message. Code is complete and deployed-ready;
  needs Twilio account setup to actually send (see cost breakdown below —
  this was already on the list for the chat SMS-fallback feature, so it's
  the same signup covering both).
- **Family CRM** (`/families`) — the actual relationship layer, not just
  case tracking. A `families` table that cases link to (search-or-create
  when creating/editing a case), so the same family shows up as one record
  across every case they've ever had with you, years apart. Each family
  page shows: every linked case, a merged timeline (cases opened +
  manually logged interactions — thank-you cards sent, grief support
  outreach, referrals, community events), and a notes/preferences field
  ("Prefers phone calls, Catholic" — the "no family repeats themselves"
  idea). Dashboard now has an **Upcoming Anniversaries** widget — any case
  whose death-date anniversary falls in the next 30 days, computed
  automatically, linking to the family (or the case if not yet linked to
  one) so outreach doesn't get missed. No new subscriptions — pure
  database/UI work.
- **First Call document** — a fourth real form template, matching the
  actual Casillas "First Call" intake sheet field-for-field. Generates,
  prints, and saves same as the other three.
- **Vendor Directory** (Admin → Vendors) — removal companies, crematories,
  florists, and anyone else documents get sent to, with category, email,
  and phone.
- **Send to Vendor** — any document on a case's Documents tab can now be
  emailed to a vendor from the directory. Opens the sender's own email app
  pre-filled with a real, working 7-day link to the document (browsers
  can't attach files to a mailto: link, so this is "send a link to click,"
  not a literal attachment — same honest limitation as the Quote Builder's
  email button).
- **Real document storage, finally** — this was a genuine, previously
  undiscovered gap: uploaded files were never actually saved anywhere real
  (a browser-only temporary link that only worked in that one tab), and
  saved generated forms didn't store a file at all. Both now actually
  upload to Supabase Storage. This was the thing blocking Send to Vendor
  from being buildable at all — worth knowing this was broken before now,
  not just newly improved.
- **Real partial payments** — Record Payment on the Quote Builder takes
  any amount and method ("$2k now, rest in two days" works correctly no
  matter how many separate payments come in — the paid amount is always
  the sum of every payment on file, never a single number set by hand),
  with a visible payment history.
- **In-person signature capture** — "Sign in Person" on the Quote Builder
  opens a real signature pad (draw with finger or mouse on a tablet/
  device), saves it as a document on the case, marks the quote signed.
  Built as a genuine alternative to emailing a SignRequest link for when
  the family's already in the room — not a DocuSign integration, which
  was never set up; this reuses SignRequest for the remote case and adds
  this as the in-person option.
- **Family-facing quote selection** — the Family Portal's Merchandise tab
  is now real. Checking an item adds it to the actual quote (the same
  data the staff Quote Builder uses, not a separate copy); a running
  total shows what's selected.
- **Task Templates** (Admin → Task Templates) — the standard checklist new
  cases start with, editable, every change audited. New cases (via First
  Call) get seeded from whatever templates are active at creation time —
  editing a template later doesn't retroactively change existing cases.
- **Pending/overdue task alerts** — a red "Pending Tasks — Past Due" card
  on the Dashboard lists every incomplete task whose due date has passed,
  across every active case. The same overdue tasks are highlighted in red
  on a case's own Tasks tab too.
- **Tasks reworked — categorized, staged, and connected to Orders.** The
  Tasks tab is now grouped by category (Permits, Merchandise, Service
  Prep, etc. each their own visible section) instead of one flat list.
  Replaced the on/off checkbox with a real 4-stage status shared with
  Orders — Initial Call → Ordered → Delivered → Completed — so both
  systems speak the same lifecycle. Adding a vendor order (Flowers,
  Casket, etc.) now automatically creates a matching task, and the two
  stay in sync in both directions: move either one's status and the other
  updates too. Also added a manual "Add a task…" input, which — genuine
  gap found while doing this — never existed before; the only way tasks
  got onto a case previously was template-seeding.

## 🚧 In progress / needs finishing

- **SignRequest end-to-end test** — infrastructure is built and deployed;
  last blocker was a malformed secret value, should be close

## 📋 Planned, not started

### Multi-tenant SaaS (selling this to other funeral homes)
Everything built so far is single-tenant — configured around and in
places hardcoded to Casillas specifically (the three legal forms use
California-specific language and Casillas's real letterhead; the GPL is
seeded with Casillas's prices; there's no self-serve signup, every account
was created by a script using the service_role key directly). Turning this
into a real product for other funeral homes is a genuinely different
project from "add another feature," and should get a dedicated security
pass (hunting for cross-tenant data leaks specifically) before a second
paying customer touches it. Full notes on this from the funeral-home-OS
industry analysis are worth revisiting when this becomes the priority —
Family CRM was picked as the first differentiated module to build toward
that vision.

### SMS fallback for chat messages
Messages (`/messages`) is live/real-time while both people are in the
app — it does NOT yet text someone if they're away from their computer.
Would need: a "last active" timestamp on staff profiles, and a check
(cron or triggered) that texts via Twilio if a message goes unread for
some period. Needs the Twilio account set up first (see cost breakdown
below) — the original ask that started this whole thread.

### Vehicle GPS tracking
Not something to build ourselves — this is a hardware + subscription
service. **Linxup** (linxup.com) looks like a solid fit: plug-in GPS
trackers (~$20–35/vehicle one-time or low monthly), fleet dashboard, real-time
location, maintenance tracking, no long-term contract required. For your 6
vehicles across 4 locations, budget roughly $25/month per vehicle for their
GPS Tracking tier (~$150/month for the full fleet) — get an exact quote
from them directly since pricing varies by plan/volume. Once you have an
account, *if* Linxup has a public API, we could pull live vehicle
locations into the Vehicles/Calendar pages — worth revisiting once the
service is actually in place.

### SMS/push notifications for staff
Shift reminders, upcoming service alerts, custody stage changes — via
Twilio (see the earlier cost breakdown: ~$15/month fixed + a couple
dollars in per-message costs at this volume). Needs: a phone number field
on staff profiles, a notification-preferences setting, and a Supabase Edge
Function + Twilio to actually send. Not started.

### AI Obituary Assistant
The "✨ Get AI writing help" button in the family portal is currently a
no-op placeholder. Same infrastructure as document extraction (Claude via
an Edge Function), text-only so cheaper — a natural next build.

### Memorial video / photo slideshow ("movie reels")
Explicitly **not** something Claude can do — this needs a dedicated
video-assembly service (e.g. Shotstack, Creatomate) or a much simpler
browser-based slideshow with no AI involved. Separate scoping conversation
whenever it's prioritized.

### Payments (Stripe)
Family portal "Pay Invoice" flow is still fully simulated. Needs Stripe
Elements + a server-side PaymentIntent via Edge Function before real money
can move through it.

### Document storage hardening
Uploads currently use browser-only object URLs in a couple of remaining
spots — confirm everything routes through Supabase Storage consistently.

## Cost tracking (approximate, current as of this doc)

| Item | Monthly |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Twilio (number + registration, not yet built) | ~$15 + usage |
| Document extraction (Claude, current volume) | ~$5–15 |
| Email matching (Claude Haiku) | ~$1–3 |
| SignRequest Business + API usage | ~$50–65 |
| Linxup GPS (if added, 6 vehicles) | ~$150 (get exact quote) |
| Stripe | 2.9% + $0.30 per transaction (not monthly) |
