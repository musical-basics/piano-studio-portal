-- #772: the CRM tables had row-level security switched OFF, so their policies
-- were never applied and anyone with the website's public key could read and
-- change every lead's name, email and message thread (17 leads, 634 messages,
-- 6 drafts on 2026-11-19, checked as the test student). The policies themselves
-- also let ANY signed-in account in (auth.role() = 'authenticated'). Now only the admin login (is_admin()) can read or change them. The
-- portal's own server code uses the service role and is unaffected; the website
-- form's insert-only policy on crm_students stays (it can't read anything back).
-- Lionel also chose to turn the CRM site (crm.musicalbasics.com) off.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
drop policy if exists "Admin manage crm_drafts" on public.crm_drafts;
drop policy if exists "Admin manage crm_messages" on public.crm_messages;
drop policy if exists "Admin manage crm_students" on public.crm_students;
create policy "Admin manage crm_drafts" on public.crm_drafts for all using (public.is_admin()) with check (public.is_admin());
create policy "Admin manage crm_messages" on public.crm_messages for all using (public.is_admin()) with check (public.is_admin());
create policy "Admin manage crm_students" on public.crm_students for all using (public.is_admin()) with check (public.is_admin());
alter table public.crm_drafts enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_students enable row level security;
