# Music (Sonos) from Casillas OS — setup

Cloud-to-cloud: the OS asks Sonos' own cloud to control your speakers, so no computer has to stay on. The wall tablet
just opens **Music** in the OS.

## One-time setup (about 15 minutes)
1. **Database** — Supabase → SQL Editor → paste `src/db/sonos.sql` → Run.
2. **Two cloud functions** — Supabase → Edge Functions → create:
   - `sonos` (paste `supabase/functions/sonos/index.ts`) — leave **Verify JWT ON**.
   - `sonos-callback` (paste `supabase/functions/sonos-callback/index.ts`) — turn **Verify JWT OFF**.
3. **Sonos developer key** — go to integrations.sonos.com, sign in with the Sonos account the speakers belong to →
   *New control integration* → name it "Casillas OS". For **Redirect URI** paste:
   `https://<your-project-ref>.supabase.co/functions/v1/sonos-callback`
   (the Music page shows this exact address with a copy button). Sonos then shows a **Key** and **Secret**.
4. **Secrets** — Supabase → Edge Functions → Secrets → add `SONOS_CLIENT_ID` (the Key), `SONOS_CLIENT_SECRET`
   (the Secret) and `APP_URL` = `https://casillasfuneralhomes-lzdc.vercel.app`.
5. **Connect** — in the OS, as an Admin, open **Music** → *Connect Sonos* → sign in to Sonos → *Allow*.
   You land back on Music with the three speakers (Chapel, Chapel Hall, Casket Room).
6. **Favorites** — in the Sonos app, save the playlists / stations you use as **Sonos Favorites**.
   They appear under *Choose music…* on each room.

## The wall tablet (Galaxy Tab A11+)
Chrome → open the OS → sign in with a staff login → Music → menu ⋮ → *Add to Home screen*. The Music page keeps the
screen awake while it is open. Plug the tablet into power.

## What the page does
Play / pause / next / previous, volume for each room or the whole group, pick a Favorite, play in all rooms together or
separate rooms, and a red *Pause everything*. Everyone on staff can use it; only Admins connect / disconnect Sonos.

## Music licensing
Sonos plays whatever service is linked to it. A personal **Spotify** account is licensed for personal, non-commercial
listening only; playing it for the public in a business (a chapel) is outside those terms. For the chapel use a
business-licensed service — e.g. **Soundtrack Your Brand** (works with Sonos) — or the family's own purchased/uploaded
songs. Whichever service you link, the OS controls it the same way through Sonos Favorites.
