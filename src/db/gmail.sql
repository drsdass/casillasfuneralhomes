-- Lets a company use Gmail (instead of, or as well as another company's Outlook) for its shared mailbox.
-- Paste into the Supabase SQL editor and run once. Safe to run again.
alter table mail_connection add column if not exists provider text not null default 'microsoft';
