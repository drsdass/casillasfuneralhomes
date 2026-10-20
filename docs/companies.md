# Casillas and Sanders as separate companies

Casillas Funeral Home and Sanders Funeral Home are separate companies sharing one Casillas OS.

- **What is separate:** staff, cases, families, calendar, vehicles, price list, task checklist, vendors, reports, audit trail, email (each has its own mailbox) and the name and letterhead on forms and messages.
- **Who sees both:** staff marked **Can switch between companies** (Admin page, a staff member's Access panel; Super Admin only). Today that is every Casillas admin and super admin. They get a **Company** switcher at the top of the sidebar. Their choice applies to that browser tab only.
- **Sanders-only people** (Kenny, Leticia, and anyone who worked only at the Sanders location) belong to Sanders, do not have the switcher and can never see Casillas data, even though they are admins at Sanders.
- **Adding staff:** the person is added to the company you are working in. Only that company's locations can be chosen.

## How it is enforced
The website tells the database which company a tab is working in (a header called `x-org-id`). The database only honours it if that person is allowed to see that company; otherwise it uses their own company. The existing security rules all run through the same three functions (`current_user_org_id`, `has_location_access`, `is_org_admin`), which `src/db/companies.sql` changes, so cases, families, staff, schedule, prices and the rest are walled off together.

Known limit: the case-documents file storage still allows any signed-in staff member to read a file if they know its exact path. File paths are random and are only shown on a case, but tightening this by company is a good next step.

## Setting it up
Run `src/db/companies.sql` once in the Supabase SQL editor, then deploy the changed Edge Functions and push the new site (see the message that came with it).
