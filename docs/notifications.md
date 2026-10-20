# Phone and computer notifications, and the On duty switch

Staff can get a notification on their lock screen (even with the app closed) for:
new emails in the shared inbox, messages from other staff, new cases / first calls (including cases they are
assigned to), and pickups (a first call at the scene). Each person chooses what they want, and can switch to
**Off duty**. Off duty means: grey light for everyone else, and no notifications, pop-ups or sounds at all.

## One-time setup (Satish)
1. Supabase → SQL Editor: run `src/db/push.sql`.
2. Supabase → Edge Functions → Secrets, add:
   - `VAPID_PUBLIC_KEY`  (the public key)
   - `VAPID_PRIVATE_KEY` (the private key)
   - `VAPID_SUBJECT`     `https://casillasfuneralhomes-lzdc.vercel.app`
3. Deploy the new function `send-push` (name exactly that; **turn OFF "Verify JWT"**), and redeploy `sync-inbox`
   (it now tells `send-push` when new mail arrives). `SYNC_SECRET` is already set.
4. Push the website.

## Each person (once per phone or computer)
- **Android:** open the site in Chrome → menu → *Add to Home screen* (optional but nice) → log in →
  **My notifications** → *Turn on notifications on this device* → Allow.
- **iPhone (iOS 16.4 or newer):** open the site in **Safari** → Share button → **Add to Home Screen** → Add →
  open it from the new Home Screen icon → log in → **My notifications** → *Turn on notifications* → Allow.
  (iPhones only allow notifications for apps added to the Home Screen.)
- **Computer:** log in → **My notifications** → *Turn on notifications on this device* → Allow.

Where to find the switch: the dot-and-number button at the top (My status), or **My notifications** at the bottom
of the left menu.

## How it behaves
- Blue dot = online now. Red dot = not in the app. Grey ring = Off duty. Phone icon = on a phone.
- Off duty = nothing is sent to any of that person's devices, and the app shows no pop-ups or sounds.
- People who work in both companies get notifications from both; the company name is at the start of the title.
  Tapping one opens the right company.
- Who is told about what: emails → everyone in that company (with the Email Inbox turned on) plus owners/admins who
  work in both; messages → the people in the conversation; new case → everyone at that location (admins see all) plus
  anyone named on the case; pickup → supervisors and above who have the Driver page.
- If the app is open and in front on a computer, the in-app pop-up is used instead of a second banner.
