-- Junk & Marketing: lets staff (and the mail check) move marketing / phishing mail out of "Needs Review".
-- Nothing is deleted. Run once in the Supabase SQL editor.
alter table inbound_emails add column if not exists junk boolean;  -- true = junk, false = "not junk", null = decided automatically
notify pgrst, 'reload schema';
