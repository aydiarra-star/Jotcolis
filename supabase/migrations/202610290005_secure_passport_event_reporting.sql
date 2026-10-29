-- JotColis: authenticated GP milestone reports for the parcel passport.
-- This records user-reported events only; it does not change booking status or prove delivery.
begin;

create or replace function public.report_passport_event(
  p_booking_id uuid,
  p_event_type public.passport_event_type,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_booking_id is null or p_event_type is null then
    raise exception 'MISSING_EVENT_FIELDS' using errcode = '22023';
  end if;

  if p_event_type not in (
    'parcel_received'::public.passport_event_type,
    'departure_reported'::public.passport_event_type,
    'arrival_reported'::public.passport_event_type,
    'handover_reported'::public.passport_event_type
  ) then
    raise exception 'EVENT_TYPE_NOT_USER_REPORTABLE' using errcode = '42501';
  end if;

  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'NOTE_TOO_LONG' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.status = 'active'
      and p.gp_approved = true
  ) then
    raise exception 'ACTIVE_APPROVED_GP_REQUIRED' using errcode = '42501';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.gp_id = v_user_id
  for update;

  if not found then
    raise exception 'OWN_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_event_type in (
    'parcel_received'::public.passport_event_type,
    'departure_reported'::public.passport_event_type
  ) and v_booking.status <> 'confirmed' then
    raise exception 'BOOKING_NOT_CONFIRMED' using errcode = '22023';
  end if;

  if p_event_type in (
    'arrival_reported'::public.passport_event_type,
    'handover_reported'::public.passport_event_type
  ) and v_booking.status <> 'in_transit' then
    raise exception 'BOOKING_NOT_IN_TRANSIT' using errcode = '22023';
  end if;

  insert into public.passport_events (
    booking_id,
    event_type,
    occurred_at,
    actor_id,
    source,
    note,
    visible_to_sender,
    visible_to_gp,
    visible_to_recipient
  ) values (
    v_booking.id,
    p_event_type,
    now(),
    v_user_id,
    'user',
    nullif(trim(p_note), ''),
    true,
    true,
    false
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.report_passport_event(uuid, public.passport_event_type, text) from public, anon;
grant execute on function public.report_passport_event(uuid, public.passport_event_type, text) to authenticated;

commit;
