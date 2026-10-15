# Casillas EDRS Assist (Chrome / Edge)

Helps a licensed funeral director copy case values from Casillas OS into the EDRS screen they are already logged into.

## Safeguards (checked by `npm run check:extension`)
- Does nothing until a person clicks a button in its panel.
- Never clicks Save/Submit/Next, never navigates, never makes network requests.
- Never overwrites a field that already has a value; skips locked fields; never guesses dropdown options.
- Case data is held in browser **memory only** (`chrome.storage.session`) and expires after 30 minutes or on "Clear case data".
- The SSN is included only if the user revealed it (audited) on the EDRS Entry screen first.
- Has no permissions beyond `storage`; it runs only on the Casillas OS site and the EDRS host.

## Install (developer mode)
1. Replace `REPLACE-WITH-EDRS-HOST` in `manifest.json` with the EDRS host (e.g. the hostname you see in the address bar after login).
2. Chrome/Edge → `chrome://extensions` → Developer mode → **Load unpacked** → choose this `extension` folder.
3. In Casillas OS open a case → EDRS Entry → **Send to EDRS Assist**.
4. In EDRS open a screen → panel (bottom right) → **Fill this screen**.

## Building the field mapping
`mapping.js` is empty, so the extension is inert except for "Capture structure". On each EDRS screen (use a test/blank record) click **Capture this screen's structure**; it copies field ids, names, labels and dropdown option labels — never values or passwords. Send those to Claude to build `mapping.js`, keyed by the row keys in `src/lib/edrsFormat.ts` (`firstName`, `dob`, `sex`, `dod`, `timeOfDeath`, `res-city`, …).

## Note
CDPH has said it will not review or approve third-party helper tools. Use under your own risk assessment and county counsel's advice.
