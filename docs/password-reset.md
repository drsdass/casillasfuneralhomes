# Forgot password

Staff tap **Forgot password?** on the login page, type their email, and get a link (valid about an hour, works once)
that opens a "Choose a new password" page. The email is sent from the company's own connected mailbox
(Outlook or Gmail), so no extra email service is needed. The answer on screen is always the same whether or not the
address is a staff login, so nobody can use it to find out who works here.

One-time setup:
1. Deploy the Edge Function `password-reset` (name exactly that, **Verify JWT OFF**). It uses the same mail secrets as `email-send`.
2. Supabase -> Authentication -> URL Configuration: add `https://casillasfuneralhomes-lzdc.vercel.app/reset-password`
   to **Redirect URLs** (and make sure **Site URL** is the live site address).
3. A company whose mailbox is not connected yet (Sanders, before Gmail) sends from the other company's mailbox.

Admin fallback (no email needed), in the SQL editor:
`update auth.users set encrypted_password = crypt('NewPassword123', gen_salt('bf')) where email = 'person@example.com';`

# Admin override for On duty

Admin -> Staff shows a small **Set Off duty / Set On duty** button under each person's name (super admins only,
not for yourself). Run `src/db/duty-admin.sql` once. Each change is written to the audit log. The person can still switch themselves back.
