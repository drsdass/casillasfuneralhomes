# Service AV — music and live stream: setup guide

What it does: staff open **Service Room** on a case (Case → Service Room) and control the chapel music and the live
stream. The family gets a private **Watch link** (anyone can view) and, if you switch it on, a private **Remote link**
for one family member to control the music from a phone. Every family can hide the casket view and the audience view,
and the system will not put a hidden view on the stream — three separate safeguards enforce it (database, the
buttons, and a check on the chapel computer that cuts to a blank screen).

> Not yet tested on real equipment. Do step 5 with ONE speaker and ONE camera first, in an empty chapel.

## What to buy (per chapel)
| Need | Suggestion | Notes |
|---|---|---|
| Speakers | **Sonos Amp** (or Sonos Port if the chapel already has a powered amp/mixer) wired to the speakers already in the ceiling/walls | One per room (chapel, waiting room). If the existing system is a mixer, use a Port into a mixer input. |
| Cameras (x3) | PTZ cameras (pan-tilt-zoom with saved presets) with HDMI/USB or network (RTSP/NDI) output | Mount: altar/lectern, front of room, back of room facing the audience. Presets let you set "casket hidden" framing. |
| Computer | A small Windows mini PC (i5 or better, 16 GB) | Runs OBS and the bridge. Leave on, wired to the network. |
| Camera inputs | HDMI capture cards (one per HDMI camera), or network cameras | Skip capture cards if the cameras are network cameras. |
| Sound for the stream | Feed from the chapel mixer/microphones into the mini PC (USB audio interface) | Without this the stream has pictures but no voices. |
| Internet | Wired connection, 10–15 Mbps **upload** | Wi-Fi is not recommended for streaming. |

Music: **Spotify's consumer terms don't allow use in a business.** Use the songs the family uploads (already in the OS),
or a licensed business music service such as Soundtrack Your Brand. The OS plays the case's uploaded songs.

## Setup steps
1. **Database.** Supabase → SQL Editor → paste all of `src/db/av.sql` → Run.
2. **Two cloud functions.** Supabase → Edge Functions → create `av-bridge` and `av-public`, paste each `supabase/functions/<name>/index.ts`, deploy. For BOTH, open Settings and turn **Verify JWT OFF**.
3. **Live player.** Create a live input at a hosted live-video service (Cloudflare Stream or Mux; avoid YouTube/Facebook — copyright muting and forwardable links). It gives you an RTMP address + key (for OBS) and an embed URL (for the Watch page). In the OS: Service Room → *Chapel setup (admins)* → paste the embed URL → Save. Do this per location.
4. **Chapel computer.**
   1. Install Node.js (LTS) and OBS Studio 30+ (obs-websocket is built in: Tools → WebSocket Server Settings → enable, set a password).
   2. In OBS create four scenes named exactly **Speaker**, **Front**, **Audience**, **Slate** (Slate = a plain dark screen with the home's name). Set Settings → Stream to the RTMP address/key from step 3.
   3. Copy the `chapel-bridge` folder to the computer. In it run `npm install`. Copy `config.example.json` to `config.json` and fill in: the anon key (Supabase → Project Settings → API), the **bridge key** (Service Room → Chapel setup → "Show the key"), and the OBS password.
   4. Run `node bridge.mjs`. The Service Room should now say **Chapel computer online** and list the speaker rooms. (To start it automatically at boot, add a Windows Task Scheduler task "At startup" running `node bridge.mjs` in that folder.)
5. **Test.** In an empty chapel: upload one song to a test case, open its Service Room, press *Play playlist*; then *Go live*, switch views, and open the Watch link on your phone. Try hiding the casket view and confirm the Front button disappears.

## Using it for a service
1. Case → Service Room. Ask the family: stream OK? show the casket? show the audience? Set the toggles.
2. Optionally set a PIN and an end date; copy the Watch link and text/email it to the family.
3. To let a family member run the music: switch on the remote link and send it only to that person.
4. At the service: *Go live* (starts on the speaker view), switch views as needed, *End stream* when done.
5. After: paste the recording link into *Replay link* if you want it available.

## Limits worth knowing
- The cloud can't reach the chapel directly, so buttons take 2–4 seconds to act.
- The family remote can never start or stop the stream.
- If the chapel computer is off, buttons wait and run when it returns; the Service Room shows the status.
- Anyone with the Watch link can watch and forward it; use the PIN and end date for sensitive services, and *Make new links* to cancel old ones.
