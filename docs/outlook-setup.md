# Shared email (Outlook / Microsoft 365): setup guide

What this gives the team: every email that arrives at the funeral home address shows up in Casillas OS, filed on the right family's case (or held for a person to confirm). Staff can read it, reply from inside the OS, and write new emails to a family. Every email sent from the OS is signed with the sender's name and recorded (who, when, which case). Replies also appear in Outlook's Sent Items. Nobody needs a computer left on: it all runs in the cloud.

You sign in to the mailbox **once**. After that nothing asks for an authenticator code.

Do steps 1 to 5 signed in to `info@casillasfuneralhome.com` (or as a Microsoft 365 admin for the funeral home).

## 1. Register the app (free)
1. Go to https://entra.microsoft.com and sign in. (If it does not open, try https://portal.azure.com, search **App registrations**.)
2. **Identity, Applications, App registrations, New registration**.
3. Name: `Casillas OS`. Supported account types: **Accounts in this organizational directory only**.
4. Redirect URI: choose **Web** and enter exactly: `https://casillasfuneralhomes-lzdc.vercel.app/inbox`
5. **Register**.
6. On the next page copy the **Application (client) ID** and the **Directory (tenant) ID**.

## 2. Make a client secret
1. Left menu, **Certificates & secrets**, **New client secret**. Name `Casillas OS`, longest expiry, **Add**.
2. Copy the **Value** right away (it is hidden afterward). This is the client secret. Put a reminder in your calendar for just before it expires.

## 3. Allow it to read and send mail
1. Left menu, **API permissions**, **Add a permission**, **Microsoft Graph**, **Delegated permissions**.
2. Tick `Mail.Read`, `Mail.Send`, `offline_access` (and `User.Read` if it is not already there). **Add permissions**.
3. If you see a button **Grant admin consent for Casillas**, and you are an admin, press it. If you are not an admin, you may be asked to approve when you sign in (step 7); if Microsoft says it needs an administrator, send them this page.

## 4. Put the keys in Supabase
Supabase dashboard, **Edge Functions**, **Secrets**, add these (names exactly):

| Name | Value |
|---|---|
| `MS_TENANT_ID` | the Directory (tenant) ID from step 1 |
| `MS_CLIENT_ID` | the Application (client) ID from step 1 |
| `MS_CLIENT_SECRET` | the secret Value from step 2 |
| `MS_REDIRECT_URI` | `https://casillasfuneralhomes-lzdc.vercel.app/inbox` (same as step 1) |
| `SYNC_SECRET` | any long random text (30+ characters) |
| `ANTHROPIC_API_KEY` | already there if document reading is set up |

## 5. Deploy four functions (Edge Functions, editor)
| Function name | Verify JWT | File |
|---|---|---|
| `mail-connect` | **ON** | `supabase/functions/mail-connect/index.ts` (new) |
| `sync-inbox` | **OFF** | `supabase/functions/sync-inbox/index.ts` (replace) |
| `email-send` | **ON** | `supabase/functions/email-send/index.ts` (replace) |
| `email-attachment-action` | as before | `supabase/functions/email-attachment-action/index.ts` (replace) |

## 6. Run the SQL
Open `src/db/mail.sql`, change `PASTE_THE_SAME_SYNC_SECRET` to your `SYNC_SECRET`, paste it all in the Supabase SQL editor, **Run**. This adds the sent-by columns, the place the sign-in is kept, and makes the mail check run every 5 minutes.

## 7. Connect the mailbox
1. Push the new version of Casillas OS, then open **Email Inbox** as an admin.
2. Press **Connect Outlook mailbox**.
3. Sign in with `info@casillasfuneralhome.com` (approve the code if asked) and accept the permissions.
4. You come back to Email Inbox and it says **Connected to info@casillasfuneralhome.com**.

## 8. Try it
Email the funeral home address from another address. Within 5 minutes it appears under **All Messages**. Press **Reply**, send, and check that the reply arrives signed with the staff member's name and is in Outlook's Sent Items.

## Good to know
- Staff keep using Outlook as always. The OS looks at every folder except Sent, Drafts, Deleted and Junk, so mail filed into folders is still found. The first check looks back 3 days.
- If the mailbox password is changed or the account is disabled, the banner on Email Inbox turns red; an admin presses **Reconnect**. The sign-in also needs renewing if the client secret expires.
- Who can reply and write emails: Supervisor and above. Who can connect or disconnect the mailbox: Admin and above.
- Nothing is filed to a family's case without a known sender, a conversation already on that case, or a person confirming it.
- If `info@` is a shared mailbox without its own login, tell me. It needs one extra permission and a small change.
