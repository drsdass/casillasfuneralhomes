# Music (Sonos) from Casillas OS — setup

Cloud-to-cloud: the OS asks Sonos' own cloud to control your speakers, so no computer has to stay on. The wall tablet
just opens **Music** in the OS.

## One-time setup (about 15 minutes)
1. **Database** — Supabase → SQL Editor → paste `src/db/sonos.sql` → Run.
2. **Two cloud functions** — Supabase → Edge Functions → create:
   - `sonos` (paste `supabase/functions/sonos/index.ts`) — leave **Verify JWT ON**.
   - `sonos-callback` (paste `supabase/functions/sonos-callback/index.ts`) — turn **Verify JWT OFF**.
3. **Sonos developer key** — go to developer.sonos.com, sign in with the Sonos account the speakers belong to →
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


---

## Spotify (direct connection)

1. Run `src/db/spotify.sql` and `src/db/sonos-lock.sql` in the Supabase SQL editor.
2. Create Edge Functions `spotify` (Verify JWT **ON**) and `spotify-callback` (Verify JWT **OFF**) from `supabase/functions/`. Redeploy `sonos` (JWT ON).
3. developer.spotify.com/dashboard → Create app (Web API) → Redirect URI = `https://<project>.supabase.co/functions/v1/spotify-callback`.
4. Secrets: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` (APP_URL already set).
5. In the Spotify app's User Management add the Premium account's name + email.
6. In the OS: Music → Connect Spotify → Agree. In the Sonos app add Spotify as a service once so the speakers appear as Spotify devices.

## Family media (USB music / video)

Run `src/db/spotify.sql` (creates the private `case-media` bucket and `case_media` table). Case → Media tab → choose files. Supabase's default per-file upload limit is 50 MB (raise it in Project Settings → Storage for long videos).

## Chapel TV (video on the chapel TV, sound from Sonos)
1. Run `src/db/chapel-player.sql` in Supabase (run `spotify.sql` first).
2. On the laptop that feeds the chapel TV, sign in to the OS, open `/player`, drag it to the TV screen and press **Start** once. Leave it open.
3. On the tablet open **Music → Chapel TV** (`/chapel-tv`). Paste YouTube links or upload videos into the House library, or open a case → **Media** and press **Play all on Chapel TV**.
4. Sound: the TV's sound must reach Sonos — HDMI-ARC to a Sonos soundbar, or the TV's audio output into the Five's line-in (Line-In autoplay on, grouped with Chapel Hall).

## Obituaries (public pages + guest book)
1. Run `src/db/obituaries.sql` in Supabase.
2. Deploy the `public-obituary` Edge Function with **Verify JWT OFF** (anyone on the internet reads published obituaries through it).
3. In the OS: **Obituaries** (left menu) for the list and editor; a case's **Obituary page** button creates the obituary from the case. The public pages are `/obituaries` and `/obituaries/<name>`.

## Website events (public Events page with sign-up)
1. Run `src/db/site-events.sql` in Supabase.
2. Re-deploy the `public-obituary` Edge Function (it now also serves events and sign-ups). Verify JWT stays OFF.
3. In the OS: **Website events** in the left menu. Public page: `/events`.
