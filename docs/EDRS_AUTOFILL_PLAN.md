# EDRS one-click fill — plan

**Status:** planning. Nothing here is built, and it can't be until the three
things under "Before we can build it" are in hand.

## What it is

A small browser extension. In the funeral director's own logged-in EDRS
session, a button fills the death-certificate fields from Casillas OS. The
director reviews every field and does the submitting, signing and registering
themselves. It never clicks those buttons.

Casillas OS never sees or stores EDRS credentials, and the extension never
asks for them — it only works on a page the director has already signed in to.

## Why layer 1 came first

Everything the extension will type or select comes from
`src/lib/edrsFormat.ts`. That module already produces the values in EDRS's own
wording (four-digit time, no accents, dashes where EDRS wants them, its
dropdown choices spelled exactly as EDRS spells them). The extension is then
mostly a mapping from "item 41 → this control on this page".

## Before we can build it

1. **CDPH's answer.** EDRS is one part of Cal-IVRS (the California Integrated
   Vital Records System), and the Cal-IVRS Participant Agreement governs how it
   may be used. CDPH can restrict or end an account for misuse, and a funeral
   home without access has to file on paper — so the downside of guessing wrong
   is losing electronic filing, not just a broken tool. Ask CDPH
   (EDRSHelp@cdph.ca.gov, (916) 552-8123) whether a director-run helper like
   this is acceptable, and get the answer in writing. (Draft email provided.)
   Also ask whether Cal-IVRS accepts any file import (IJE / HL7 FHIR) from
   funeral establishments — a vendor-summary claimed it does; nothing found
   confirms it for California.
1b. **What other vendors actually do here.** Continental Computers (TDAW) says it
   integrates with "participating states" and names Pennsylvania as its latest;
   it doesn't name California. Ask Continental and Passare directly: *does it
   push to Cal-IVRS EDRS, and how — an API, a file, or screen entry?* Whatever
   they say shows what California permits.
2. **What EDRS's pages look like.** I can't log in, so I can't see them.
   Using a **test or blank record with made-up data — never a real decedent**:
   for each of these screens, send a screenshot plus the page saved as
   "Webpage, HTML only" (right-click → Save as):
   - the new-record / create-certificate screen
   - the decedent personal-data screen (items 1–19)
   - residence, informant and family (items 20–38)
   - disposition and funeral home (items 39–45)
   - place of death (items 101–106)
   - the Certificate menu that holds "Request SSN Verification"
   Also: the web address's host name only, whether CDPH offers a training
   environment, and which browser the staff use. The saved HTML must not be
   of the login page.
3. **How it gets installed.** A private extension on staff computers
   (Chrome or Edge). Keeping it off the public store is simplest.

## How it works

- A "Fill EDRS" button on the EDRS Entry screen sends the case's values to the
  extension (an `externally_connectable` message from the Casillas OS site
  only). The values are exactly `buildEdrsRows()`'s output.
- The extension keeps them in memory for that tab only. Nothing is written to
  disk, and they are cleared when the tab closes or after a few minutes.
- The SSN is fetched only when the director asks for it, through the same
  audited function as everywhere else, and is cleared as soon as it is typed.
- A content script runs only on the EDRS host name. For each item it finds the
  control, fills text boxes, and picks dropdown choices by their visible text.
- It never presses Save, Submit, Sign, Attest or Register.
- A small panel lists every item as filled / not found / skipped, so a change
  to EDRS's page shows up as "12 of 63 not found" instead of a silent gap.

## Phases

1. **Dry run.** Highlight what it *would* fill, change nothing. Proves the
   mapping against real pages.
2. **Fill text and dropdowns** for one screen at a time, starting with items 1–19.
3. **The rest**, then the checklist panel.
4. **Upkeep.** EDRS can change without warning; the not-found report is the
   early warning. Budget for occasional repair.

## Risks

- **Fragility.** A redesign breaks the mapping until it's repaired.
- **Policy.** The reason step 1 above comes first.
- **Two-step fields.** Some items ask for a type, then reveal a second field
  (birthplace, addresses). The extension has to fill them in order and wait for
  the second field to appear.
- **Browser lookups** (embalmer, funeral establishment, occupation, country)
  use EDRS's magnifying-glass browsers. Those may stay manual at first.
