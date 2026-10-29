-- JotColis: least-privilege grants for exposed public tables.
-- The app reads real trips/corridors and writes trip drafts only through guarded RPCs.
-- Existing row-level security policies remain in place; this removes unnecessary table privileges.
begin;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select on table public.corridors, public.trips to anon;
grant select on table
  public.corridors,
  public.trips,
  public.profiles,
  public.parcel_requests,
  public.bookings,
  public.passport_events,
  public.incidents
to authenticated;

-- Users may edit only their own public profile fields; approval/status remain operator-controlled.
revoke all privileges (display_name, phone, country_code)
  on table public.profiles from authenticated;
grant update (display_name, phone, country_code)
  on table public.profiles to authenticated;

-- Keep future objects least-privilege too; new public RPCs/tables must opt in explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

commit;
