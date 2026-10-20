# Connecting a Gmail shared mailbox (Sanders Funeral Home)

Casillas OS reads a company's shared mailbox and files each email to the right case, and staff can reply from the OS. Casillas uses Outlook; Sanders uses Gmail. Each company connects its own mailbox, and the same 3-minute check reads both.

What it can and cannot do: it can **read** mail and **send** mail. It cannot delete, move, archive or mark anything as read, so nobody's mailbox changes. Sent mail from the OS shows in Gmail's Sent folder. Mail already sent from Gmail itself, drafts, Trash and Spam are ignored.

## 1. Google Cloud project (one time, about 10 minutes)
1. Go to https://console.cloud.google.com and sign in with the Sanders Gmail account (or any Google account that will own the setup). Create a project named **Casillas OS Mail**.
2. **APIs & Services → Library**: search **Gmail API** and press **Enable**.
3. **APIs & Services → OAuth consent screen** (may be called "Google Auth Platform"):
   - User type **External** (if the mailbox is a normal @gmail.com). If it is Google Workspace on its own domain you may choose **Internal**.
   - App name **Casillas OS**, support email = the Sanders Gmail, developer contact = your email.
   - **Scopes**: add `.../auth/gmail.readonly` and `.../auth/gmail.send`.
   - **Test users**: add the Sanders Gmail address.
   - Then press **Publish app** so the status is **In production**. This matters: while an app is only in "Testing", Google ends the connection every 7 days. "In production" without Google's review shows a "Google hasn't verified this app" screen the first time (allowed for up to 100 users, which is plenty).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type **Web application**, name **Casillas OS**, and under **Authorized redirect URIs** add exactly `https://casillasfuneralhomes-lzdc.vercel.app/inbox`. Press Create and copy the **Client ID** and **Client secret**.

## 2. Give the keys to Casillas OS
Supabase → Edge Functions → Secrets → add:
| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID |
| `GOOGLE_CLIENT_SECRET` | the Client secret |

(The redirect address is reused from the Outlook setup, `MS_REDIRECT_URI`. If you ever remove that, add `GOOGLE_REDIRECT_URI` with the same address.)

## 3. Database and functions
- SQL editor: run `src/db/gmail.sql` once.
- Deploy these Edge Functions (replace the code; keep each Verify JWT setting as it is): `mail-connect`, `sync-inbox`, `email-send`, `email-attachment-action`.

## 4. Connect
Open Casillas OS, switch to **Sanders** (company switcher), open **Email Inbox**, press **Connect Gmail**, sign in with the Sanders Gmail account. On the "Google hasn't verified this app" page choose **Advanced → Go to Casillas OS (unsafe)** (it is your own app), then tick both permission boxes and continue. You return to Email Inbox showing **Connected to ... (Gmail)**.

## Good to know
- Replies go out from the Gmail address under the company name, signed with the staff member's name, and stay in the same Gmail conversation.
- If the banner turns red, press **Reconnect** (for example after the Gmail password is changed or app access is removed in the Google account).
- Nothing is filed to a family's case without a known sender, a conversation already on that case, or a person confirming it.
