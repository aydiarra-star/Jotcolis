-- JotColis: controlled GP trip drafts and publication.
-- Existing rows are preserved. GP approval is operator-controlled and defaults to false.
begin;

alter table public.profiles
  add column if not exists gp_approved boolean not null default false;

create or replace function public.list_trip_corridors()
returns table (
  id uuid,
  origin_country_code text,
  destination_country_code text,
  origin_label text,
  destination_label text,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.origin_country_code, c.destination_country_code,
         c.origin_label, c.destination_label, c.is_active
  from public.corridors c
  order by c.origin_country_code, c.destination_country_code, c.origin_label;
$$;

revoke all on function public.list_trip_corridors() from public;
grant execute on function public.list_trip_corridors() to authenticated;

create or replace function public.create_trip_draft(
  p_corridor_id uuid,
  p_origin_city text,
  p_destination_city text,
  p_departure_at timestamptz,
  p_capacity_kg numeric,
  p_currency text default 'EUR',
  p_price_per_kg numeric default null,
  p_conditions text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_status public.account_status;
  v_trip_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select p.status into v_profile_status
  from public.profiles p where p.id = v_user_id;

  if v_profile_status is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_profile_status <> 'active' then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;
  if not exists (select 1 from public.corridors c where c.id = p_corridor_id) then
    raise exception 'CORRIDOR_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_origin_city is null or char_length(trim(p_origin_city)) not between 1 and 120
     or p_destination_city is null or char_length(trim(p_destination_city)) not between 1 and 120 then
    raise exception 'INVALID_CITY' using errcode = '22023';
  end if;
  if p_departure_at is null or p_departure_at <= now() then
    raise exception 'DEPARTURE_MUST_BE_FUTURE' using errcode = '22023';
  end if;
  if p_capacity_kg is null or p_capacity_kg <= 0 or p_capacity_kg > 500 then
    raise exception 'INVALID_CAPACITY' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'INVALID_CURRENCY' using errcode = '22023';
  end if;
  if p_price_per_kg is not null and p_price_per_kg < 0 then
    raise exception 'INVALID_PRICE' using errcode = '22023';
  end if;
  if p_conditions is not null and char_length(p_conditions) > 2000 then
    raise exception 'CONDITIONS_TOO_LONG' using errcode = '22023';
  end if;

  insert into public.trips (
    gp_id, corridor_id, origin_city, destination_city, departure_at,
    capacity_total_kg, capacity_remaining_kg, currency, price_per_kg,
    conditions, status
  ) values (
    v_user_id, p_corridor_id, trim(p_origin_city), trim(p_destination_city),
    p_departure_at, p_capacity_kg, p_capacity_kg, p_currency,
    p_price_per_kg, nullif(trim(p_conditions), ''), 'draft'
  ) returning id into v_trip_id;

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip_draft(uuid,text,text,timestamptz,numeric,text,numeric,text) from public;
grant execute on function public.create_trip_draft(uuid,text,text,timestamptz,numeric,text,numeric,text) to authenticated;

create or replace function public.publish_my_trip(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip public.trips%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.status = 'active' and p.gp_approved = true
  ) then
    raise exception 'GP_APPROVAL_REQUIRED' using errcode = '42501';
  end if;

  select t.* into v_trip
  from public.trips t
  where t.id = p_trip_id and t.gp_id = v_user_id
  for update;

  if not found then
    raise exception 'OWN_TRIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_trip.status <> 'draft' then
    raise exception 'TRIP_NOT_DRAFT' using errcode = '22023';
  end if;
  if v_trip.departure_at <= now() then
    raise exception 'DEPARTURE_MUST_BE_FUTURE' using errcode = '22023';
  end if;
  if v_trip.capacity_total_kg <= 0 or v_trip.capacity_remaining_kg <> v_trip.capacity_total_kg then
    raise exception 'INVALID_CAPACITY_STATE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.corridors c
    where c.id = v_trip.corridor_id and c.is_active = true
  ) then
    raise exception 'CORRIDOR_INACTIVE' using errcode = '42501';
  end if;

  update public.trips set status = 'published'
  where id = v_trip.id and gp_id = v_user_id and status = 'draft';

  return v_trip.id;
end;
$$;

revoke all on function public.publish_my_trip(uuid) from public;
grant execute on function public.publish_my_trip(uuid) to authenticated;

commit;
