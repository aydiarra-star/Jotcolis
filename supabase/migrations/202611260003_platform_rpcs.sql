-- JotColis — logique métier serveur (2026-11-26).
-- Toutes les fonctions sont SECURITY DEFINER avec search_path verrouillé,
-- dérivent l'identité de auth.uid(), valident leurs paramètres et écrivent un audit.
-- Aucune opération n'est simulée : une erreur SQL annule toute la transaction.
begin;

alter table public.gp_verifications add column if not exists last_submission_key text;

-- ---------------------------------------------------------------------------
-- Helpers internes (non exécutables par le navigateur)
-- ---------------------------------------------------------------------------

create or replace function public.config_bool(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (value #>> '{}')::boolean
    from public.platform_config
    where key = p_key
  ), false);
$$;

create or replace function public.config_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (value #>> '{}')::integer
    from public.platform_config
    where key = p_key
  ), p_default);
$$;

create or replace function public.assert_active_account(
  p_require_verified_email boolean default true,
  p_require_complete_profile boolean default true
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_status public.account_status;
  v_deactivated timestamptz;
  v_completed timestamptz;
  v_terms timestamptz;
  v_privacy timestamptz;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select p.status, p.deactivated_at, p.profile_completed_at, p.terms_accepted_at, p.privacy_accepted_at
    into v_status, v_deactivated, v_completed, v_terms, v_privacy
  from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status <> 'active' or v_deactivated is not null then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;
  if p_require_complete_profile and (v_completed is null or v_terms is null or v_privacy is null) then
    raise exception 'PROFILE_INCOMPLETE' using errcode = '42501';
  end if;
  if p_require_verified_email then
    select u.email_confirmed_at into v_confirmed from auth.users u where u.id = v_uid;
    if v_confirmed is null then
      raise exception 'EMAIL_NOT_VERIFIED' using errcode = '42501';
    end if;
  end if;
end;
$$;

create or replace function public.assert_admin()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not public.current_user_is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- Blocage juridique explicite : les quatorze validations FR/SN et la liste
-- complète des marchandises doivent être documentées avant tout transport réel.
create or replace function public.legal_gate_complete()
returns boolean language sql stable security definer set search_path = '' as $$
  with required(jurisdiction, scope) as (
    values
      ('FR','business_model'), ('SN','business_model'),
      ('FR','transport_rules'), ('SN','transport_rules'),
      ('FR','customs'), ('SN','customs'),
      ('FR','airline'), ('SN','airline'),
      ('FR','insurance'), ('SN','insurance'),
      ('FR','privacy'), ('SN','privacy'),
      ('FR','terms'), ('SN','terms')
  )
  select
    not exists (
      select 1 from required r
      where not exists (
        select 1 from public.legal_validations v
        where v.jurisdiction = r.jurisdiction and v.scope = r.scope
      )
    )
    and coalesce(bool_and(pc.is_legally_validated), false)
    from public.prohibited_categories pc;
$$;

create or replace function public.assert_commercial_open()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.config_bool('commercial_open') or not public.config_bool('legal_validation_complete') then
    raise exception 'COMMERCIAL_OPERATIONS_DISABLED' using errcode = '42501';
  end if;
  if not public.legal_gate_complete() then
    raise exception 'LEGAL_VALIDATIONS_INCOMPLETE' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.corridors
    where is_active = true and legal_validation_ref is not null
  ) then
    raise exception 'NO_VALIDATED_ACTIVE_CORRIDOR' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_pricing_validated()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.config_bool('pricing_config_validated') then
    raise exception 'PRICING_NOT_VALIDATED' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_correlation_id uuid default null
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, correlation_id)
  values (
    v_uid,
    case when public.current_user_is_admin() then 'admin' else 'authenticated' end,
    p_action, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_correlation_id, gen_random_uuid())
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.enqueue_notification(
  p_event_key text,
  p_event_type text,
  p_recipient_user_id uuid,
  p_channel text,
  p_payload jsonb default '{}'::jsonb,
  p_recipient_contact text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_status text;
  v_error text;
  v_attempt_status text;
  v_max integer := public.config_int('notification_max_attempts', 5);
begin
  if p_event_key is null or char_length(p_event_key) < 3 then
    raise exception 'INVALID_EVENT_KEY' using errcode = '22023';
  end if;
  if p_channel not in ('in_app','email','whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;

  if p_channel = 'in_app' then
    v_status := 'sent';
    v_error := null;
    v_attempt_status := 'sent';
  elsif not public.config_bool('notifications_enabled') then
    v_status := 'blocked';
    v_error := 'NOTIFICATIONS_DISABLED';
    v_attempt_status := 'blocked';
  elsif p_channel = 'email' and not public.config_bool('email_provider_configured') then
    v_status := 'blocked';
    v_error := 'EMAIL_PROVIDER_NOT_CONFIGURED';
    v_attempt_status := 'blocked';
  elsif p_channel = 'whatsapp' and not public.config_bool('whatsapp_provider_configured') then
    v_status := 'blocked';
    v_error := 'WHATSAPP_PROVIDER_NOT_CONFIGURED';
    v_attempt_status := 'blocked';
  else
    v_status := 'pending';
    v_error := null;
    v_attempt_status := null;
  end if;

  insert into public.notification_outbox (
    event_key, event_type, recipient_user_id, recipient_contact, channel,
    payload, status, max_attempts, last_error, provider, sent_at
  ) values (
    p_event_key, p_event_type, p_recipient_user_id, p_recipient_contact, p_channel,
    coalesce(p_payload, '{}'::jsonb), v_status, v_max, v_error,
    case when p_channel = 'in_app' then 'in_app' else null end,
    case when p_channel = 'in_app' then now() else null end
  )
  on conflict (event_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.notification_outbox where event_key = p_event_key;
    return v_id;
  end if;

  if v_attempt_status is not null then
    insert into public.notification_attempts
      (notification_id, attempt_no, status, provider, error_code)
    values (v_id, 1, v_attempt_status, case when p_channel = 'in_app' then 'in_app' else null end, v_error);
  end if;
  return v_id;
end;
$$;

create or replace function public.notify_user(
  p_event_key text,
  p_event_type text,
  p_user_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_channels text[] default array['in_app','email','whatsapp']::text[]
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_channel text;
  v_contact text;
  v_email text;
  v_phone text;
begin
  if p_user_id is null then return; end if;
  select u.email, p.phone into v_email, v_phone
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  foreach v_channel in array p_channels loop
    v_contact := case
      when v_channel = 'email' then v_email
      when v_channel = 'whatsapp' then v_phone
      else null
    end;
    perform public.enqueue_notification(
      p_event_key || ':' || v_channel,
      p_event_type,
      p_user_id,
      v_channel,
      p_payload,
      v_contact
    );
  end loop;
end;
$$;

create or replace function public.notify_admins(
  p_event_key text,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin record;
begin
  for v_admin in
    select ur.user_id
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.role = 'admin' and ur.revoked_at is null and p.status = 'active'
  loop
    perform public.notify_user(
      p_event_key || ':' || v_admin.user_id::text,
      p_event_type,
      v_admin.user_id,
      p_payload,
      array['in_app','email']::text[]
    );
  end loop;
end;
$$;

create or replace function public.normalize_code(p_code text)
returns text language sql immutable set search_path = '' as $$
  select upper(replace(replace(coalesce(p_code, ''), ' ', ''), '-', ''));
$$;

create or replace function public.hash_secret(p_salt text, p_secret text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_salt || ':' || p_secret, 'UTF8')), 'hex'
  );
$$;

create or replace function public.generate_parcel_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
begin
  loop
    v_code := 'JC-' || to_char(now(), 'YYYY') || '-' || upper(substring(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 12
    ));
    exit when not exists (select 1 from public.parcel_requests r where r.parcel_code = v_code)
             and not exists (select 1 from public.bookings b where b.parcel_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.generate_delivery_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_raw text := upper(substring(
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 16
  ));
begin
  return 'JC-' || substring(v_raw, 1, 4) || '-' || substring(v_raw, 5, 4)
      || '-' || substring(v_raw, 9, 4) || '-' || substring(v_raw, 13, 4);
end;
$$;

create or replace function public.add_passport_event(
  p_booking_id uuid,
  p_request_id uuid,
  p_parcel_code text,
  p_event_type public.passport_event_type,
  p_label text,
  p_note text default null,
  p_public boolean default false,
  p_actor uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.passport_events (
    booking_id, request_id, parcel_code, event_type, occurred_at, actor_id,
    source, note, visible_to_sender, visible_to_gp, visible_to_recipient,
    visible_to_public, payload
  ) values (
    p_booking_id, p_request_id, p_parcel_code, p_event_type, now(),
    coalesce(p_actor, auth.uid()), 'server',
    case when p_public then null else nullif(trim(p_note), '') end,
    true, true, p_public, p_public,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('label', p_label)
  ) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profil, rôles, corridors
-- ---------------------------------------------------------------------------

create or replace function public.update_my_profile(
  p_display_name text,
  p_phone text,
  p_country_code text default null,
  p_accept_terms boolean default false,
  p_accept_privacy boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.assert_active_account(false, false);
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 80 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
  end if;
  if p_phone is null or p_phone !~ '^[+0-9 ().-]{6,30}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  if p_country_code is not null and p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'INVALID_COUNTRY' using errcode = '22023';
  end if;
  if not p_accept_terms or not p_accept_privacy then
    raise exception 'TERMS_REQUIRED' using errcode = '42501';
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      phone = trim(p_phone),
      country_code = p_country_code,
      terms_accepted_at = coalesce(terms_accepted_at, now()),
      privacy_accepted_at = coalesce(privacy_accepted_at, now()),
      profile_completed_at = coalesce(profile_completed_at, now())
  where id = v_uid;

  perform public.audit_event('profile_completed', 'profile', v_uid::text);
end;
$$;

create or replace function public.request_role(p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.assert_active_account(false, false);
  if p_role not in ('recipient', 'gp_applicant') then
    raise exception 'ROLE_NOT_SELF_ASSIGNABLE' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  values (v_uid, p_role, null)
  on conflict do nothing;
  perform public.audit_event('role_requested', 'user_role', v_uid::text, jsonb_build_object('role', p_role));
end;
$$;

drop function if exists public.list_trip_corridors();
create function public.list_trip_corridors()
returns table (
  id uuid,
  origin_country_code text,
  destination_country_code text,
  origin_label text,
  destination_label text,
  is_active boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.origin_country_code, c.destination_country_code,
         c.origin_label, c.destination_label, c.is_active
  from public.corridors c
  order by c.origin_country_code, c.destination_country_code, c.origin_label;
$$;

create or replace function public.get_my_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select jsonb_build_object(
    'user_id', v_uid,
    'email', (select u.email from auth.users u where u.id = v_uid),
    'email_verified', (select u.email_confirmed_at is not null from auth.users u where u.id = v_uid),
    'profile', to_jsonb(p),
    'roles', coalesce((
      select jsonb_agg(r.role order by r.role)
      from public.user_roles r
      where r.user_id = v_uid and r.revoked_at is null
    ), '[]'::jsonb),
    'is_admin', public.current_user_is_admin(),
    'gp_verification', (
      select to_jsonb(v) - 'review_notes' - 'last_submission_key'
      from public.gp_verifications v where v.user_id = v_uid
    ),
    'config', coalesce((
      select jsonb_object_agg(c.key, c.value)
      from public.platform_config c
      where c.key in ('commercial_open','legal_validation_complete','notifications_enabled',
                      'email_provider_configured','whatsapp_provider_configured','pricing_config_validated')
    ), '{}'::jsonb),
    'prohibited_categories_legally_validated', coalesce((
      select bool_and(pc.is_legally_validated) from public.prohibited_categories pc
    ), false)
  ) into v_result
  from public.profiles p where p.id = v_uid;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Trajets : brouillon, publication contrôlée, modification, annulation, recherche
-- ---------------------------------------------------------------------------

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
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
begin
  perform public.assert_active_account(true, true);
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
    v_uid, p_corridor_id, trim(p_origin_city), trim(p_destination_city),
    p_departure_at, p_capacity_kg, p_capacity_kg, p_currency,
    p_price_per_kg, nullif(trim(p_conditions), ''), 'draft'
  ) returning id into v_trip_id;

  perform public.audit_event('trip_draft_created', 'trip', v_trip_id::text,
    jsonb_build_object('capacity_kg', p_capacity_kg));
  return v_trip_id;
end;
$$;

create or replace function public.publish_my_trip(p_trip_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_alert record;
begin
  perform public.assert_active_account(true, true);
  perform public.assert_commercial_open();

  if not exists (
    select 1 from public.gp_verifications v
    where v.user_id = v_uid and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > now())
  ) or not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.status = 'active' and p.gp_approved = true
  ) then
    raise exception 'GP_APPROVAL_REQUIRED' using errcode = '42501';
  end if;

  select t.* into v_trip from public.trips t
  where t.id = p_trip_id and t.gp_id = v_uid for update;
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
    where c.id = v_trip.corridor_id and c.is_active = true and c.legal_validation_ref is not null
  ) then
    raise exception 'CORRIDOR_NOT_VALIDATED' using errcode = '42501';
  end if;

  update public.trips
  set status = 'published', published_at = now(), version = version + 1
  where id = v_trip.id and gp_id = v_uid and status = 'draft';

  for v_alert in
    update public.trip_alerts
    set status = 'matched', matched_trip_id = v_trip.id, notified_at = now()
    where status = 'active'
      and lower(origin_city) = lower(v_trip.origin_city)
      and lower(destination_city) = lower(v_trip.destination_city)
      and (desired_date is null or v_trip.departure_at::date >= desired_date)
    returning id, user_id, contact
  loop
    perform public.notify_user(
      'trip-alert:' || v_alert.id::text,
      'trip_alert_matched',
      v_alert.user_id,
      jsonb_build_object('trip_id', v_trip.id::text, 'origin_city', v_trip.origin_city, 'destination_city', v_trip.destination_city),
      array['in_app','email','whatsapp']::text[]
    );
  end loop;

  perform public.notify_user(
    'trip-published:' || v_trip.id::text,
    'trip_published',
    v_uid,
    jsonb_build_object('trip_id', v_trip.id::text),
    array['in_app']::text[]
  );
  perform public.audit_event('trip_published', 'trip', v_trip.id::text);
  return v_trip.id;
end;
$$;

create or replace function public.update_my_trip(p_trip_id uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_allowed text[] := array['origin_city','destination_city','departure_at','capacity_kg',
                            'currency','price_per_kg','conditions','corridor_id'];
  v_key text;
  v_new_capacity numeric;
  v_new_departure timestamptz;
  v_has_bookings boolean;
begin
  perform public.assert_active_account(true, true);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'INVALID_PATCH' using errcode = '22023';
  end if;
  for v_key in select key from jsonb_object_keys(p_patch) as t(key) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'UNSUPPORTED_FIELD' using errcode = '22023';
    end if;
  end loop;

  select t.* into v_trip from public.trips t
  where t.id = p_trip_id and t.gp_id = v_uid for update;
  if not found then
    raise exception 'OWN_TRIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('draft','published') then
    raise exception 'TRIP_NOT_EDITABLE' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.bookings b
    where b.trip_id = v_trip.id and b.status not in ('cancelled','delivered')
  ) into v_has_bookings;

  if v_trip.status = 'published' then
    if v_has_bookings then
      raise exception 'TRIP_LOCKED_BY_BOOKINGS' using errcode = '42501';
    end if;
    if p_patch ? 'origin_city' or p_patch ? 'destination_city' or p_patch ? 'departure_at'
       or p_patch ? 'capacity_kg' or p_patch ? 'corridor_id' or p_patch ? 'currency' then
      raise exception 'PUBLISHED_TRIP_FIELDS_RESTRICTED' using errcode = '42501';
    end if;
    update public.trips
    set price_per_kg = coalesce((p_patch->>'price_per_kg')::numeric, price_per_kg),
        conditions = case when p_patch ? 'conditions'
          then nullif(trim(p_patch->>'conditions'), '') else conditions end,
        version = version + 1
    where id = v_trip.id;
  else
    if p_patch ? 'capacity_kg' then
      v_new_capacity := (p_patch->>'capacity_kg')::numeric;
      if v_new_capacity is null or v_new_capacity <= 0 or v_new_capacity > 500 then
        raise exception 'INVALID_CAPACITY' using errcode = '22023';
      end if;
    else
      v_new_capacity := v_trip.capacity_total_kg;
    end if;
    if p_patch ? 'departure_at' then
      v_new_departure := (p_patch->>'departure_at')::timestamptz;
      if v_new_departure is null or v_new_departure <= now() then
        raise exception 'DEPARTURE_MUST_BE_FUTURE' using errcode = '22023';
      end if;
    else
      v_new_departure := v_trip.departure_at;
    end if;
    update public.trips
    set origin_city = coalesce(nullif(trim(p_patch->>'origin_city'), ''), origin_city),
        destination_city = coalesce(nullif(trim(p_patch->>'destination_city'), ''), destination_city),
        departure_at = v_new_departure,
        capacity_total_kg = v_new_capacity,
        capacity_remaining_kg = v_new_capacity,
        currency = coalesce(p_patch->>'currency', currency),
        price_per_kg = coalesce((p_patch->>'price_per_kg')::numeric, price_per_kg),
        conditions = case when p_patch ? 'conditions'
          then nullif(trim(p_patch->>'conditions'), '') else conditions end,
        corridor_id = coalesce((p_patch->>'corridor_id')::uuid, corridor_id),
        version = version + 1,
        last_capacity_change_at = case when p_patch ? 'capacity_kg' then now() else last_capacity_change_at end
    where id = v_trip.id;
  end if;

  perform public.notify_user(
    'trip-updated:' || v_trip.id::text || ':' || gen_random_uuid()::text,
    'trip_updated',
    v_uid,
    jsonb_build_object('trip_id', v_trip.id::text),
    array['in_app']::text[]
  );
  perform public.audit_event('trip_updated', 'trip', v_trip.id::text,
    jsonb_build_object('fields', p_patch));
  return v_trip.id;
end;
$$;

create or replace function public.cancel_my_trip(p_trip_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips%rowtype;
begin
  perform public.assert_active_account(true, false);
  select t.* into v_trip from public.trips t
  where t.id = p_trip_id and t.gp_id = v_uid for update;
  if not found then
    raise exception 'OWN_TRIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('draft','published') then
    raise exception 'TRIP_NOT_CANCELLABLE' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.trip_id = v_trip.id and b.status not in ('cancelled','delivered')
  ) then
    raise exception 'ACTIVE_BOOKINGS_PRESENT' using errcode = '42501';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'REASON_TOO_LONG' using errcode = '22023';
  end if;

  update public.trips
  set status = 'cancelled', cancelled_at = now(), version = version + 1
  where id = v_trip.id;
  perform public.notify_user(
    'trip-cancelled:' || v_trip.id::text,
    'trip_cancelled',
    v_uid,
    jsonb_build_object('trip_id', v_trip.id::text),
    array['in_app']::text[]
  );
  perform public.audit_event('trip_cancelled', 'trip', v_trip.id::text,
    jsonb_build_object('reason', p_reason));
  return v_trip.id;
end;
$$;

create or replace function public.search_trips(
  p_origin text default null,
  p_destination text default null,
  p_date date default null,
  p_min_capacity numeric default null
)
returns table (
  id uuid,
  origin_city text,
  destination_city text,
  departure_at timestamptz,
  capacity_remaining_kg numeric,
  currency char(3),
  price_per_kg numeric,
  conditions text,
  origin_label text,
  destination_label text,
  published_at timestamptz,
  gp_verification_status text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.origin_city, a.destination_city, a.departure_at,
         a.capacity_remaining_kg, a.currency, a.price_per_kg, a.conditions,
         a.origin_label, a.destination_label, a.published_at, a.gp_verification_status
  from public.available_trips a
  where (p_origin is null or char_length(trim(p_origin)) = 0
         or position(lower(trim(p_origin)) in lower(a.origin_city)) > 0)
    and (p_destination is null or char_length(trim(p_destination)) = 0
         or position(lower(trim(p_destination)) in lower(a.destination_city)) > 0)
    and (p_date is null or a.departure_at >= p_date::timestamptz)
    and (p_min_capacity is null or a.capacity_remaining_kg >= p_min_capacity)
  order by a.departure_at asc
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Vérification GP
-- ---------------------------------------------------------------------------

create or replace function public.submit_gp_verification(
  p_legal_first_name text,
  p_legal_last_name text,
  p_phone text,
  p_travel_departure_at timestamptz,
  p_travel_destination text,
  p_travel_capacity_kg numeric,
  p_identity_doc_path text,
  p_idempotency_key text,
  p_travel_reference text default null,
  p_justification_note text default null,
  p_travel_doc_path text default null,
  p_identity_content_type text default null,
  p_identity_size_bytes bigint default null,
  p_travel_content_type text default null,
  p_travel_size_bytes bigint default null,
  p_accept_terms boolean default false
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text;
  v_existing_key text;
begin
  perform public.assert_active_account(true, true);
  if not p_accept_terms then
    raise exception 'TERMS_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  select g.last_submission_key into v_existing_key
  from public.gp_verifications g where g.user_id = v_uid;
  if v_existing_key = p_idempotency_key then
    return (select status from public.gp_verifications where user_id = v_uid);
  end if;

  if p_legal_first_name is null or char_length(trim(p_legal_first_name)) not between 1 and 80
     or p_legal_last_name is null or char_length(trim(p_legal_last_name)) not between 1 and 80 then
    raise exception 'INVALID_LEGAL_NAME' using errcode = '22023';
  end if;
  if p_phone is null or p_phone !~ '^[+0-9 ().-]{6,30}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  if p_travel_departure_at is null or p_travel_departure_at <= now() then
    raise exception 'DEPARTURE_MUST_BE_FUTURE' using errcode = '22023';
  end if;
  if p_travel_destination is null or char_length(trim(p_travel_destination)) not between 1 and 120 then
    raise exception 'INVALID_DESTINATION' using errcode = '22023';
  end if;
  if p_travel_capacity_kg is null or p_travel_capacity_kg <= 0 or p_travel_capacity_kg > 500 then
    raise exception 'INVALID_CAPACITY' using errcode = '22023';
  end if;
  if p_justification_note is not null and char_length(p_justification_note) > 1000 then
    raise exception 'NOTE_TOO_LONG' using errcode = '22023';
  end if;
  if p_identity_size_bytes is not null and (p_identity_size_bytes < 0 or p_identity_size_bytes > 10485760) then
    raise exception 'INVALID_DOCUMENT_SIZE' using errcode = '22023';
  end if;
  if p_travel_size_bytes is not null and (p_travel_size_bytes < 0 or p_travel_size_bytes > 10485760) then
    raise exception 'INVALID_DOCUMENT_SIZE' using errcode = '22023';
  end if;

  v_prefix := v_uid::text || '/';
  if p_identity_doc_path is null
     or left(p_identity_doc_path, char_length(v_prefix)) <> v_prefix
     or p_identity_doc_path like '%..%'
     or p_identity_doc_path !~ '^[a-f0-9-]+/[A-Za-z0-9._/-]+$' then
    raise exception 'INVALID_DOCUMENT_PATH' using errcode = '22023';
  end if;
  if p_travel_doc_path is not null
     and (left(p_travel_doc_path, char_length(v_prefix)) <> v_prefix
          or p_travel_doc_path like '%..%'
          or p_travel_doc_path !~ '^[a-f0-9-]+/[A-Za-z0-9._/-]+$') then
    raise exception 'INVALID_DOCUMENT_PATH' using errcode = '22023';
  end if;

  insert into public.gp_verifications (
    user_id, status, legal_first_name, legal_last_name, phone,
    identity_status, contact_status, travel_status, documents_status,
    travel_departure_at, travel_destination, travel_capacity_kg, travel_reference,
    justification_note, submitted_at, last_submission_key
  ) values (
    v_uid, 'pending', trim(p_legal_first_name), trim(p_legal_last_name), trim(p_phone),
    'pending', 'pending', 'pending', 'pending',
    p_travel_departure_at, trim(p_travel_destination), p_travel_capacity_kg,
    nullif(trim(p_travel_reference), ''), nullif(trim(p_justification_note), ''),
    now(), p_idempotency_key
  )
  on conflict (user_id) do update set
    status = 'pending',
    legal_first_name = excluded.legal_first_name,
    legal_last_name = excluded.legal_last_name,
    phone = excluded.phone,
    identity_status = 'pending',
    contact_status = 'pending',
    travel_status = 'pending',
    documents_status = 'pending',
    travel_departure_at = excluded.travel_departure_at,
    travel_destination = excluded.travel_destination,
    travel_capacity_kg = excluded.travel_capacity_kg,
    travel_reference = excluded.travel_reference,
    justification_note = excluded.justification_note,
    reviewer_id = null,
    review_notes = null,
    reviewed_at = null,
    expires_at = null,
    submitted_at = now(),
    last_submission_key = excluded.last_submission_key;

  -- Une nouvelle soumission retire l'approbation précédente : contrôle admin requis.
  update public.profiles set gp_approved = false where id = v_uid;

  insert into public.verification_documents
    (user_id, kind, storage_bucket, storage_path, content_type, size_bytes, status)
  values
    (v_uid, 'identity', 'gp-documents', p_identity_doc_path, p_identity_content_type, p_identity_size_bytes, 'pending')
  on conflict (user_id, storage_path) do nothing;

  if p_travel_doc_path is not null then
    insert into public.verification_documents
      (user_id, kind, storage_bucket, storage_path, content_type, size_bytes, status)
    values
      (v_uid, 'travel_proof', 'gp-documents', p_travel_doc_path, p_travel_content_type, p_travel_size_bytes, 'pending')
    on conflict (user_id, storage_path) do nothing;
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (v_uid, 'gp_applicant', null)
  on conflict do nothing;

  insert into public.gp_verification_events (user_id, from_status, to_status, actor_id, note)
  values (v_uid, null, 'pending', v_uid, 'Dossier soumis par l utilisateur');

  perform public.notify_admins(
    'gp-verification-submitted:' || p_idempotency_key,
    'gp_verification_submitted',
    jsonb_build_object('user_id', v_uid::text)
  );
  perform public.notify_user(
    'gp-verification-received:' || p_idempotency_key,
    'gp_verification_submitted',
    v_uid,
    jsonb_build_object('status', 'pending'),
    array['in_app']::text[]
  );
  perform public.audit_event('gp_verification_submitted', 'gp_verification', v_uid::text);
  return 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Demandes de colis et réservation atomique de capacité
-- ---------------------------------------------------------------------------

create or replace function public.submit_parcel_request(
  p_trip_id uuid,
  p_description text,
  p_declared_content text,
  p_weight_kg numeric,
  p_recipient_name text,
  p_recipient_contact text,
  p_sender_contact text,
  p_terms_accepted boolean,
  p_prohibited_confirmed boolean,
  p_idempotency_key text,
  p_length_cm numeric default null,
  p_width_cm numeric default null,
  p_height_cm numeric default null,
  p_message text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_code text;
  v_request_id uuid;
  v_window integer := public.config_int('request_duplicate_window_minutes', 10);
  v_existing_code text;
begin
  perform public.assert_active_account(true, true);
  perform public.assert_commercial_open();
  -- Idempotence stricte : un double clic renvoie la même référence, sans nouvel événement.
  if p_idempotency_key is not null then
    select r.parcel_code into v_existing_code
    from public.parcel_requests r
    where r.sender_id = v_uid and r.trip_id = p_trip_id and r.idempotency_key = p_idempotency_key;
    if found then
      return v_existing_code;
    end if;
  end if;
  if not p_terms_accepted or not p_prohibited_confirmed then
    raise exception 'DECLARATIONS_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 500 then
    raise exception 'INVALID_DESCRIPTION' using errcode = '22023';
  end if;
  if p_declared_content is null or char_length(trim(p_declared_content)) not between 3 and 500 then
    raise exception 'CONTENT_DECLARATION_REQUIRED' using errcode = '22023';
  end if;
  if p_weight_kg is null or p_weight_kg <= 0 or p_weight_kg > 100 then
    raise exception 'INVALID_WEIGHT' using errcode = '22023';
  end if;
  if (p_length_cm is not null and p_length_cm <= 0)
     or (p_width_cm is not null and p_width_cm <= 0)
     or (p_height_cm is not null and p_height_cm <= 0) then
    raise exception 'INVALID_DIMENSIONS' using errcode = '22023';
  end if;
  if p_recipient_name is null or char_length(trim(p_recipient_name)) not between 1 and 120 then
    raise exception 'INVALID_RECIPIENT_NAME' using errcode = '22023';
  end if;
  if p_recipient_contact is null or char_length(trim(p_recipient_contact)) not between 3 and 160
     or p_sender_contact is null or char_length(trim(p_sender_contact)) not between 3 and 160 then
    raise exception 'INVALID_CONTACT' using errcode = '22023';
  end if;
  if p_message is not null and char_length(p_message) > 1000 then
    raise exception 'MESSAGE_TOO_LONG' using errcode = '22023';
  end if;

  -- Anti-doublon vérifié avant la disponibilité : un second clic ne doit pas
  -- créer une nouvelle demande même si la capacité a changé entre-temps.
  if exists (
    select 1 from public.parcel_requests r
    where r.sender_id = v_uid and r.trip_id = p_trip_id
      and r.weight_kg = p_weight_kg and r.description = trim(p_description)
      and r.created_at > now() - (v_window || ' minutes')::interval
      and r.status not in ('cancelled','rejected','expired')
  ) then
    raise exception 'DUPLICATE_REQUEST' using errcode = '42501';
  end if;

  select t.* into v_trip
  from public.trips t
  join public.corridors c on c.id = t.corridor_id
  join public.gp_verifications v on v.user_id = t.gp_id
  join public.profiles p on p.id = t.gp_id
  where t.id = p_trip_id
    and t.status = 'published'
    and c.is_active = true
    and t.departure_at > now()
    and t.capacity_remaining_kg >= p_weight_kg
    and t.price_per_kg is not null
    and v.status = 'approved'
    and (v.expires_at is null or v.expires_at > now())
    and p.status = 'active'
    and p.gp_approved = true;
  if not found then
    raise exception 'TRIP_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  if v_trip.gp_id = v_uid then
    raise exception 'SELF_BOOKING_FORBIDDEN' using errcode = '42501';
  end if;

  v_code := public.generate_parcel_code();
  insert into public.parcel_requests (
    sender_id, trip_id, corridor_id, origin_city, destination_city,
    description, declared_content, weight_kg, length_cm, width_cm, height_cm,
    recipient_name, recipient_contact, sender_contact,
    terms_accepted_at, prohibited_confirmed_at, idempotency_key,
    parcel_code, status, submitted_at
  ) values (
    v_uid, p_trip_id, v_trip.corridor_id, v_trip.origin_city, v_trip.destination_city,
    trim(p_description), trim(p_declared_content), p_weight_kg,
    p_length_cm, p_width_cm, p_height_cm,
    trim(p_recipient_name), trim(p_recipient_contact), trim(p_sender_contact),
    now(), now(), p_idempotency_key,
    v_code, 'awaiting_gp', now()
  )
  on conflict (sender_id, trip_id, idempotency_key)
    where idempotency_key is not null and trip_id is not null
  do nothing
  returning id, parcel_code into v_request_id, v_code;

  if v_request_id is null then
    select r.parcel_code into v_code
    from public.parcel_requests r
    where r.sender_id = v_uid and r.trip_id = p_trip_id and r.idempotency_key = p_idempotency_key;
    return v_code;
  end if;

  perform public.add_passport_event(
    null, v_request_id, v_code, 'request_created'::public.passport_event_type,
    'Demande créée', p_message, true, v_uid,
    jsonb_build_object('status', 'awaiting_gp', 'origin_city', v_trip.origin_city, 'destination_city', v_trip.destination_city)
  );
  perform public.notify_user(
    'request-created-gp:' || v_request_id::text,
    'request_created',
    v_trip.gp_id,
    jsonb_build_object('parcel_code', v_code, 'status', 'awaiting_gp'),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.notify_user(
    'request-created-sender:' || v_request_id::text,
    'request_created',
    v_uid,
    jsonb_build_object('parcel_code', v_code, 'status', 'awaiting_gp'),
    array['in_app']::text[]
  );
  perform public.audit_event('parcel_request_created', 'parcel_request', v_request_id::text,
    jsonb_build_object('parcel_code', v_code, 'trip_id', p_trip_id::text, 'weight_kg', p_weight_kg));
  return v_code;
end;
$$;

create or replace function public.respond_to_request(
  p_request_id uuid,
  p_accept boolean,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_req public.parcel_requests%rowtype;
  v_trip public.trips%rowtype;
  v_booking_id uuid;
  v_amount numeric(10,2);
  v_new_capacity numeric(8,2);
begin
  perform public.assert_active_account(true, true);
  perform public.assert_commercial_open();
  perform public.assert_pricing_validated();
  if p_accept is null then
    raise exception 'DECISION_REQUIRED' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'NOTE_TOO_LONG' using errcode = '22023';
  end if;

  -- Verrouillage de la demande puis du trajet : ordre constant pour éviter les interblocages.
  select r.* into v_req from public.parcel_requests r
  where r.id = p_request_id for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_req.status <> 'awaiting_gp' then
    raise exception 'REQUEST_NOT_DECIDABLE' using errcode = '22023';
  end if;
  if v_req.trip_id is null or v_req.expires_at <= now() then
    raise exception 'REQUEST_EXPIRED' using errcode = '22023';
  end if;
  if v_req.terms_accepted_at is null or v_req.prohibited_confirmed_at is null then
    raise exception 'DECLARATIONS_MISSING' using errcode = '42501';
  end if;

  select t.* into v_trip from public.trips t
  where t.id = v_req.trip_id for update;
  if not found then
    raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_trip.gp_id <> v_uid then
    raise exception 'NOT_TRIP_OWNER' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.gp_verifications v
    where v.user_id = v_uid and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > now())
  ) or not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.status = 'active' and p.gp_approved = true
  ) then
    raise exception 'GP_APPROVAL_REQUIRED' using errcode = '42501';
  end if;
  if v_trip.status <> 'published' or v_trip.departure_at <= now() then
    raise exception 'TRIP_NOT_AVAILABLE' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.corridors c
    where c.id = v_trip.corridor_id and c.is_active = true and c.legal_validation_ref is not null
  ) then
    raise exception 'CORRIDOR_NOT_VALIDATED' using errcode = '42501';
  end if;
  if exists (select 1 from public.bookings b where b.parcel_request_id = v_req.id) then
    raise exception 'BOOKING_ALREADY_EXISTS' using errcode = '42501';
  end if;
  if v_req.sender_id = v_trip.gp_id then
    raise exception 'SELF_BOOKING_FORBIDDEN' using errcode = '42501';
  end if;

  if not p_accept then
    update public.parcel_requests
    set status = 'rejected', decided_at = now(), decision_note = p_note
    where id = v_req.id;
    perform public.add_passport_event(
      null, v_req.id, v_req.parcel_code, 'request_rejected'::public.passport_event_type,
      'Demande refusée', p_note, false, v_uid,
      jsonb_build_object('status', 'rejected')
    );
    perform public.notify_user(
      'request-rejected:' || v_req.id::text,
      'request_rejected',
      v_req.sender_id,
      jsonb_build_object('parcel_code', v_req.parcel_code, 'status', 'rejected'),
      array['in_app','email','whatsapp']::text[]
    );
    perform public.audit_event('request_rejected', 'parcel_request', v_req.id::text);
    return null;
  end if;

  if v_trip.price_per_kg is null then
    raise exception 'PRICE_NOT_CONFIGURED' using errcode = '42501';
  end if;
  if v_trip.capacity_remaining_kg < v_req.weight_kg then
    raise exception 'CAPACITY_EXHAUSTED' using errcode = 'P0001';
  end if;

  v_amount := round(v_req.weight_kg * v_trip.price_per_kg, 2);
  update public.trips
  set capacity_remaining_kg = capacity_remaining_kg - v_req.weight_kg,
      last_capacity_change_at = now(),
      version = version + 1
  where id = v_trip.id and capacity_remaining_kg >= v_req.weight_kg
  returning capacity_remaining_kg into v_new_capacity;
  if v_new_capacity is null then
    raise exception 'CAPACITY_EXHAUSTED' using errcode = 'P0001';
  end if;

  insert into public.bookings (
    parcel_request_id, trip_id, sender_id, gp_id,
    recipient_name, recipient_contact, weight_kg,
    agreed_price, currency, status,
    parcel_code, capacity_reserved_kg, price_per_kg, pricing_snapshot
  ) values (
    v_req.id, v_trip.id, v_req.sender_id, v_trip.gp_id,
    v_req.recipient_name, v_req.recipient_contact, v_req.weight_kg,
    v_amount, v_trip.currency, 'awaiting_confirmation',
    v_req.parcel_code, v_req.weight_kg, v_trip.price_per_kg,
    jsonb_build_object(
      'price_per_kg', v_trip.price_per_kg,
      'weight_kg', v_req.weight_kg,
      'amount', v_amount,
      'currency', v_trip.currency,
      'commission', 0,
      'calculated_at', now(),
      'pricing_config_validated', true
    )
  ) returning id into v_booking_id;

  update public.parcel_requests
  set status = 'accepted', decided_at = now(), decision_note = p_note
  where id = v_req.id;

  perform public.add_passport_event(
    null, v_req.id, v_req.parcel_code, 'request_accepted'::public.passport_event_type,
    'Demande acceptée', p_note, true, v_uid,
    jsonb_build_object('status', 'accepted')
  );
  perform public.add_passport_event(
    v_booking_id, null, v_req.parcel_code, 'capacity_reserved'::public.passport_event_type,
    'Capacité réservée', null, false, v_uid,
    jsonb_build_object('weight_kg', v_req.weight_kg, 'capacity_remaining_kg', v_new_capacity)
  );
  perform public.add_passport_event(
    v_booking_id, null, v_req.parcel_code, 'booking_created'::public.passport_event_type,
    'Réservation créée, en attente de confirmation', null, true, v_uid,
    jsonb_build_object('status', 'awaiting_confirmation')
  );

  perform public.notify_user(
    'request-accepted:' || v_req.id::text,
    'request_accepted',
    v_req.sender_id,
    jsonb_build_object('parcel_code', v_req.parcel_code, 'status', 'awaiting_confirmation'),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.notify_user(
    'booking-created-gp:' || v_booking_id::text,
    'booking_created',
    v_uid,
    jsonb_build_object('parcel_code', v_req.parcel_code, 'status', 'awaiting_confirmation'),
    array['in_app']::text[]
  );
  perform public.audit_event('request_accepted_capacity_reserved', 'booking', v_booking_id::text,
    jsonb_build_object('parcel_code', v_req.parcel_code, 'weight_kg', v_req.weight_kg,
                       'capacity_remaining_kg', v_new_capacity, 'amount', v_amount));
  return v_booking_id;
end;
$$;

create or replace function public.confirm_booking(p_booking_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  perform public.assert_active_account(true, true);
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.sender_id <> v_uid then
    raise exception 'NOT_BOOKING_SENDER' using errcode = '42501';
  end if;
  if v_booking.status <> 'awaiting_confirmation' then
    raise exception 'BOOKING_NOT_CONFIRMABLE' using errcode = '22023';
  end if;

  update public.bookings
  set status = 'confirmed', confirmed_at = now()
  where id = v_booking.id;
  update public.parcel_requests
  set status = 'confirmed' where id = v_booking.parcel_request_id;

  perform public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, 'booking_confirmed'::public.passport_event_type,
    'Réservation confirmée', null, true, v_uid,
    jsonb_build_object('status', 'confirmed')
  );
  perform public.notify_user(
    'booking-confirmed-gp:' || v_booking.id::text,
    'booking_confirmed',
    v_booking.gp_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code, 'status', 'confirmed'),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.notify_user(
    'booking-confirmed-sender:' || v_booking.id::text,
    'booking_confirmed',
    v_uid,
    jsonb_build_object('parcel_code', v_booking.parcel_code, 'status', 'confirmed'),
    array['in_app']::text[]
  );
  perform public.audit_event('booking_confirmed', 'booking', v_booking.id::text);
  return v_booking.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Passeport : transitions contrôlées par une table de règles
-- ---------------------------------------------------------------------------

create or replace function public.advance_booking(
  p_booking_id uuid,
  p_event_type public.passport_event_type,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_rule public.booking_event_rules%rowtype;
  v_is_admin boolean := public.current_user_is_admin();
  v_is_gp boolean;
  v_is_sender boolean;
  v_event_id uuid;
begin
  perform public.assert_active_account(false, false);
  if p_booking_id is null or p_event_type is null then
    raise exception 'MISSING_EVENT_FIELDS' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'NOTE_TOO_LONG' using errcode = '22023';
  end if;

  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then
    raise exception 'OWN_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_is_gp := v_booking.gp_id = v_uid;
  v_is_sender := v_booking.sender_id = v_uid;

  select r.* into v_rule from public.booking_event_rules r
  where r.event_type = p_event_type and r.from_status = v_booking.status;
  if not found then
    raise exception 'INVALID_BOOKING_TRANSITION' using errcode = '22023';
  end if;

  if v_rule.allowed_actor = 'gp' and not (v_is_gp or v_is_admin) then
    raise exception 'NOT_BOOKING_GP' using errcode = '42501';
  elsif v_rule.allowed_actor = 'participant' and not (v_is_gp or v_is_sender or v_is_admin) then
    raise exception 'NOT_BOOKING_PARTICIPANT' using errcode = '42501';
  elsif v_rule.allowed_actor = 'admin' and not v_is_admin then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if (v_rule.allowed_actor = 'gp' and v_is_gp) and not exists (
    select 1 from public.gp_verifications v
    where v.user_id = v_uid and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > now())
  ) then
    raise exception 'GP_APPROVAL_REQUIRED' using errcode = '42501';
  end if;

  update public.bookings
  set status = v_rule.to_status,
      pickup_ready_at = case when v_rule.to_status = 'ready_for_pickup' and pickup_ready_at is null
                             then now() else pickup_ready_at end,
      disputed_at = case when v_rule.to_status = 'disputed' and disputed_at is null
                         then now() else disputed_at end
  where id = v_booking.id;
  update public.parcel_requests
  set status = v_rule.to_status::text::public.request_status
  where id = v_booking.parcel_request_id
    and v_rule.to_status::text in (
      'confirmed','in_preparation','in_transit','arrived','ready_for_pickup','disputed','delivered'
    );

  v_event_id := public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, p_event_type,
    v_rule.public_label, p_note, v_rule.public_event, v_uid,
    jsonb_build_object('label', v_rule.public_label, 'status', v_rule.to_status::text)
  );

  if v_rule.public_event then
    perform public.notify_user(
      'passport:' || v_event_id::text || ':sender',
      'passport_event',
      v_booking.sender_id,
      jsonb_build_object('parcel_code', v_booking.parcel_code, 'label', v_rule.public_label, 'status', v_rule.to_status::text),
      array['in_app','email','whatsapp']::text[]
    );
    perform public.notify_user(
      'passport:' || v_event_id::text || ':gp',
      'passport_event',
      v_booking.gp_id,
      jsonb_build_object('parcel_code', v_booking.parcel_code, 'label', v_rule.public_label, 'status', v_rule.to_status::text),
      array['in_app']::text[]
    );
  end if;
  perform public.audit_event('passport_event_recorded', 'booking', v_booking.id::text,
    jsonb_build_object('event_type', p_event_type::text, 'from', v_booking.status::text, 'to', v_rule.to_status::text));
  return v_event_id;
end;
$$;

-- Compatibilité ascendante : l'ancien RPC ne crée plus un événement sans transition.
create or replace function public.report_passport_event(
  p_booking_id uuid,
  p_event_type public.passport_event_type,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return public.advance_booking(p_booking_id, p_event_type, p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Code de remise, annulation, incidents, suivi public
-- ---------------------------------------------------------------------------

create or replace function public.issue_delivery_code(p_booking_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_code text;
  v_salt text;
  v_ttl integer := public.config_int('delivery_code_ttl_hours', 48);
  v_max integer := public.config_int('delivery_code_max_attempts', 5);
begin
  perform public.assert_active_account(false, false);
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_booking.sender_id = v_uid or v_booking.gp_id = v_uid or public.current_user_is_admin()) then
    raise exception 'NOT_BOOKING_PARTICIPANT' using errcode = '42501';
  end if;
  if v_booking.status <> 'ready_for_pickup' then
    raise exception 'BOOKING_NOT_READY_FOR_PICKUP' using errcode = '22023';
  end if;
  if exists (select 1 from public.delivery_codes d where d.booking_id = v_booking.id) then
    raise exception 'DELIVERY_CODE_ALREADY_ISSUED' using errcode = '42501';
  end if;

  v_code := public.generate_delivery_code();
  v_salt := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.delivery_codes (
    booking_id, parcel_code, code_salt, code_hash, expires_at,
    max_attempts, created_by
  ) values (
    v_booking.id, v_booking.parcel_code, v_salt,
    public.hash_secret(v_salt, public.normalize_code(v_code)),
    now() + (v_ttl || ' hours')::interval, v_max, v_uid
  );

  perform public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, 'delivery_code_issued'::public.passport_event_type,
    'Code de remise généré', null, true, v_uid,
    jsonb_build_object('status', 'ready_for_pickup', 'expires_in_hours', v_ttl)
  );
  -- Le code en clair n'est jamais stocké : aucun message externe n'est prétendu envoyé.
  perform public.notify_user(
    'delivery-code-ready:' || v_booking.id::text || ':sender',
    'delivery_code_ready',
    v_booking.sender_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code,
                       'instruction', 'Transmettez le code au destinataire par votre propre canal sécurisé. Aucun envoi automatique du code n est effectué.'),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.notify_user(
    'delivery-code-ready:' || v_booking.id::text || ':gp',
    'delivery_code_ready',
    v_booking.gp_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code),
    array['in_app']::text[]
  );
  perform public.audit_event('delivery_code_issued', 'booking', v_booking.id::text);
  return v_code;
end;
$$;

create or replace function public.verify_delivery_code(p_parcel_code text, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_code_row public.delivery_codes%rowtype;
  v_normalized text;
begin
  perform public.assert_active_account(false, false);
  if p_parcel_code is null or char_length(trim(p_parcel_code)) < 8
     or p_code is null or char_length(p_code) > 50 then
    raise exception 'INVALID_CODE_INPUT' using errcode = '22023';
  end if;
  select b.* into v_booking from public.bookings b
  where b.parcel_code = upper(trim(p_parcel_code)) for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_booking.gp_id = v_uid or public.current_user_is_admin()) then
    raise exception 'NOT_BOOKING_GP' using errcode = '42501';
  end if;
  if v_booking.status <> 'ready_for_pickup' then
    raise exception 'BOOKING_NOT_READY_FOR_PICKUP' using errcode = '22023';
  end if;

  select d.* into v_code_row from public.delivery_codes d
  where d.booking_id = v_booking.id for update;
  if not found then
    raise exception 'DELIVERY_CODE_NOT_ISSUED' using errcode = 'P0002';
  end if;
  if v_code_row.used_at is not null or v_code_row.revoked_at is not null then
    raise exception 'DELIVERY_CODE_NOT_ACTIVE' using errcode = '42501';
  end if;
  if v_code_row.expires_at <= now() then
    raise exception 'DELIVERY_CODE_EXPIRED' using errcode = '42501';
  end if;
  if v_code_row.attempts >= v_code_row.max_attempts then
    raise exception 'DELIVERY_CODE_LOCKED' using errcode = '42501';
  end if;

  v_normalized := public.normalize_code(p_code);
  if public.hash_secret(v_code_row.code_salt, v_normalized) <> v_code_row.code_hash then
    update public.delivery_codes set attempts = attempts + 1 where id = v_code_row.id;
    perform public.add_passport_event(
      v_booking.id, null, v_booking.parcel_code,
      'delivery_attempt_failed'::public.passport_event_type,
      'Tentative de code invalide', null, false, v_uid,
      jsonb_build_object('attempts', v_code_row.attempts + 1)
    );
    perform public.audit_event('delivery_code_attempt_failed', 'booking', v_booking.id::text);
    return false;
  end if;

  update public.delivery_codes set used_at = now() where id = v_code_row.id;
  update public.bookings
  set status = 'delivered', delivered_at = now()
  where id = v_booking.id;
  update public.parcel_requests
  set status = 'delivered' where id = v_booking.parcel_request_id;

  perform public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, 'delivery_confirmed'::public.passport_event_type,
    'Code vérifié, colis remis au destinataire', null, true, v_uid,
    jsonb_build_object('status', 'delivered')
  );
  perform public.notify_user(
    'delivery-confirmed:' || v_booking.id::text || ':sender',
    'delivery_confirmed',
    v_booking.sender_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code, 'status', 'delivered'),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.notify_user(
    'delivery-confirmed:' || v_booking.id::text || ':gp',
    'delivery_confirmed',
    v_booking.gp_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code, 'status', 'delivered'),
    array['in_app']::text[]
  );
  perform public.audit_event('delivery_confirmed', 'booking', v_booking.id::text);
  return true;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_trip public.trips%rowtype;
  v_is_admin boolean := public.current_user_is_admin();
begin
  perform public.assert_active_account(true, false);
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'REASON_TOO_LONG' using errcode = '22023';
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_booking.sender_id = v_uid or v_booking.gp_id = v_uid or v_is_admin) then
    raise exception 'NOT_BOOKING_PARTICIPANT' using errcode = '42501';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking.id; -- idempotent : aucune seconde libération de capacité
  end if;
  if v_booking.status = 'delivered' then
    raise exception 'DELIVERED_BOOKING_NOT_CANCELLABLE' using errcode = '22023';
  end if;
  if v_booking.status in ('in_transit','arrived','ready_for_pickup','disputed') and not v_is_admin then
    raise exception 'ADMIN_REQUIRED_FOR_LATE_CANCELLATION' using errcode = '42501';
  end if;
  if v_booking.status not in ('awaiting_confirmation','confirmed','in_preparation',
                              'in_transit','arrived','ready_for_pickup','disputed') then
    raise exception 'BOOKING_NOT_CANCELLABLE' using errcode = '22023';
  end if;

  select t.* into v_trip from public.trips t
  where t.id = v_booking.trip_id for update;

  if v_booking.capacity_released_at is null and v_booking.capacity_reserved_kg is not null and found then
    update public.trips
    set capacity_remaining_kg = least(capacity_total_kg, capacity_remaining_kg + v_booking.capacity_reserved_kg),
        last_capacity_change_at = now(), version = version + 1
    where id = v_trip.id;
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_at = now(),
      capacity_released_at = coalesce(capacity_released_at, now()),
      cancellation_reason = p_reason
  where id = v_booking.id;
  update public.parcel_requests
  set status = 'cancelled', cancelled_at = now()
  where id = v_booking.parcel_request_id;
  update public.delivery_codes
  set revoked_at = now()
  where booking_id = v_booking.id and used_at is null and revoked_at is null;

  perform public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, 'booking_cancelled'::public.passport_event_type,
    'Réservation annulée', p_reason, true, v_uid,
    jsonb_build_object('status', 'cancelled')
  );
  perform public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, 'capacity_released'::public.passport_event_type,
    'Capacité libérée', null, false, v_uid,
    jsonb_build_object('weight_kg', v_booking.capacity_reserved_kg)
  );
  perform public.notify_user(
    'booking-cancelled:' || v_booking.id::text || ':sender',
    'booking_cancelled',
    v_booking.sender_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code, 'status', 'cancelled'),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.notify_user(
    'booking-cancelled:' || v_booking.id::text || ':gp',
    'booking_cancelled',
    v_booking.gp_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code, 'status', 'cancelled'),
    array['in_app']::text[]
  );
  perform public.audit_event('booking_cancelled', 'booking', v_booking.id::text,
    jsonb_build_object('reason', p_reason, 'capacity_released_kg', v_booking.capacity_reserved_kg));
  return v_booking.id;
end;
$$;

create or replace function public.report_incident(
  p_booking_id uuid,
  p_category text,
  p_description text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_incident_id uuid;
  v_ref text;
begin
  perform public.assert_active_account(true, false);
  if p_category not in ('delay','damaged_parcel','missing_parcel','handover','conduct','prohibited_content','other') then
    raise exception 'INVALID_CATEGORY' using errcode = '22023';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 3000 then
    raise exception 'INVALID_DESCRIPTION' using errcode = '22023';
  end if;
  select b.* into v_booking from public.bookings b
  where b.id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (v_booking.sender_id = v_uid or v_booking.gp_id = v_uid or public.current_user_is_admin()) then
    raise exception 'NOT_BOOKING_PARTICIPANT' using errcode = '42501';
  end if;
  if v_booking.status in ('cancelled','delivered') then
    raise exception 'BOOKING_CLOSED' using errcode = '22023';
  end if;

  v_ref := 'INC-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.incidents (
    booking_id, opened_by, category, description, status, internal_reference
  ) values (
    v_booking.id, v_uid, p_category, trim(p_description), 'open', v_ref
  ) returning id into v_incident_id;

  if v_booking.status in ('confirmed','in_preparation','in_transit','arrived','ready_for_pickup') then
    update public.bookings set status = 'disputed', disputed_at = now() where id = v_booking.id;
    update public.parcel_requests set status = 'disputed' where id = v_booking.parcel_request_id;
  end if;
  perform public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, 'incident_opened'::public.passport_event_type,
    'Incident signalé', null, false, v_uid,
    jsonb_build_object('incident_reference', v_ref, 'category', p_category)
  );
  perform public.notify_admins(
    'incident-opened:' || v_incident_id::text,
    'incident_opened',
    jsonb_build_object('incident_id', v_incident_id::text, 'reference', v_ref, 'category', p_category)
  );
  perform public.audit_event('incident_opened', 'incident', v_incident_id::text,
    jsonb_build_object('reference', v_ref, 'category', p_category));
  return v_incident_id;
end;
$$;

create or replace function public.create_trip_alert(
  p_origin_city text,
  p_destination_city text,
  p_contact text,
  p_consent boolean,
  p_date date default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform public.assert_active_account(true, false);
  if not p_consent then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  if p_origin_city is null or char_length(trim(p_origin_city)) not between 1 and 120
     or p_destination_city is null or char_length(trim(p_destination_city)) not between 1 and 120 then
    raise exception 'INVALID_CITY' using errcode = '22023';
  end if;
  if p_contact is null or char_length(trim(p_contact)) not between 3 and 160 then
    raise exception 'INVALID_CONTACT' using errcode = '22023';
  end if;
  if p_date is not null and p_date < current_date then
    raise exception 'DATE_MUST_BE_FUTURE' using errcode = '22023';
  end if;

  insert into public.trip_alerts (
    user_id, origin_city, destination_city, desired_date, contact, consent_at
  ) values (
    v_uid, trim(p_origin_city), trim(p_destination_city), p_date, trim(p_contact), now()
  ) returning id into v_id;

  perform public.notify_user(
    'trip-alert-created:' || v_id::text,
    'trip_alert_created',
    v_uid,
    jsonb_build_object('origin_city', trim(p_origin_city), 'destination_city', trim(p_destination_city),
                       'note', 'Alerte enregistrée en base. Aucun message externe n est envoyé sans prestataire configuré.'),
    array['in_app']::text[]
  );
  perform public.audit_event('trip_alert_created', 'trip_alert', v_id::text);
  return v_id;
end;
$$;

create or replace function public.get_parcel_passport(p_parcel_code text)
returns table (
  parcel_code text,
  current_status text,
  event_type text,
  label text,
  occurred_at timestamptz,
  sequence_no bigint,
  event_hash text
)
language sql stable security definer set search_path = '' as $$
  with target as (
    select b.id as booking_id, b.status::text as current_status, null::uuid as request_id
    from public.bookings b where b.parcel_code = upper(trim(p_parcel_code))
    union all
    select null::uuid, r.status::text, r.id
    from public.parcel_requests r where r.parcel_code = upper(trim(p_parcel_code))
  )
  select
    upper(trim(p_parcel_code)),
    t.current_status,
    e.event_type::text,
    coalesce(e.payload ->> 'label', e.event_type::text),
    e.occurred_at,
    e.sequence_no,
    e.event_hash
  from target t
  join public.passport_events e
    on e.parcel_code = upper(trim(p_parcel_code))
   and e.visible_to_public = true
  order by e.sequence_no asc;
$$;

commit;
