-- JotColis MVP — migration initiale proposée (à relire avant application)
-- Cette migration n'a PAS été exécutée sur Supabase.
-- Les réservations/capacités ne sont volontairement pas modifiables directement par le client :
-- elles devront passer par des fonctions serveur transactionnelles auditées.

begin;

create extension if not exists pgcrypto;

create type public.account_status as enum ('active', 'suspended', 'closed');
create type public.trip_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.request_status as enum ('open', 'matched', 'cancelled', 'expired');
create type public.booking_status as enum ('pending', 'confirmed', 'in_transit', 'delivered', 'cancelled', 'disputed');
create type public.passport_event_type as enum (
  'booking_created', 'booking_confirmed', 'parcel_received',
  'departure_reported', 'arrival_reported', 'handover_reported',
  'delivery_confirmed', 'incident_opened', 'correction'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  phone text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.corridors (
  id uuid primary key default gen_random_uuid(),
  origin_country_code text not null check (origin_country_code ~ '^[A-Z]{2}$'),
  destination_country_code text not null check (destination_country_code ~ '^[A-Z]{2}$'),
  origin_label text not null check (char_length(origin_label) between 1 and 120),
  destination_label text not null check (char_length(destination_label) between 1 and 120),
  is_active boolean not null default false,
  rules_url text,
  validation_notes text,
  created_at timestamptz not null default now(),
  unique (origin_country_code, destination_country_code, origin_label, destination_label)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  gp_id uuid not null references public.profiles(id) on delete restrict,
  corridor_id uuid not null references public.corridors(id) on delete restrict,
  origin_city text not null check (char_length(origin_city) between 1 and 120),
  destination_city text not null check (char_length(destination_city) between 1 and 120),
  departure_at timestamptz not null,
  arrival_at timestamptz,
  capacity_total_kg numeric(8,2) not null check (capacity_total_kg > 0 and capacity_total_kg <= 500),
  capacity_remaining_kg numeric(8,2) not null,
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  price_per_kg numeric(10,2) check (price_per_kg is null or price_per_kg >= 0),
  conditions text,
  status public.trip_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capacity_remaining_kg >= 0 and capacity_remaining_kg <= capacity_total_kg),
  check (arrival_at is null or arrival_at >= departure_at)
);

create index trips_search_idx on public.trips (corridor_id, departure_at)
  where status = 'published';
create index trips_gp_idx on public.trips (gp_id, created_at desc);

create table public.parcel_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  corridor_id uuid not null references public.corridors(id) on delete restrict,
  origin_city text not null check (char_length(origin_city) between 1 and 120),
  destination_city text not null check (char_length(destination_city) between 1 and 120),
  description text not null check (char_length(description) between 1 and 500),
  weight_kg numeric(8,2) not null check (weight_kg > 0 and weight_kg <= 100),
  length_cm numeric(7,2) check (length_cm is null or length_cm > 0),
  width_cm numeric(7,2) check (width_cm is null or width_cm > 0),
  height_cm numeric(7,2) check (height_cm is null or height_cm > 0),
  latest_delivery_at timestamptz,
  status public.request_status not null default 'open',
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index parcel_requests_search_idx on public.parcel_requests (corridor_id, created_at desc)
  where status = 'open';
create index parcel_requests_sender_idx on public.parcel_requests (sender_id, created_at desc);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  parcel_request_id uuid not null references public.parcel_requests(id) on delete restrict,
  trip_id uuid not null references public.trips(id) on delete restrict,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  gp_id uuid not null references public.profiles(id) on delete restrict,
  recipient_name text,
  recipient_contact text,
  weight_kg numeric(8,2) not null check (weight_kg > 0),
  agreed_price numeric(10,2) not null check (agreed_price >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> gp_id)
);

create index bookings_sender_idx on public.bookings (sender_id, created_at desc);
create index bookings_gp_idx on public.bookings (gp_id, created_at desc);
create index bookings_trip_idx on public.bookings (trip_id, status);

create table public.passport_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  event_type public.passport_event_type not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  source text not null default 'user' check (source in ('user', 'server', 'partner', 'admin')),
  note text check (note is null or char_length(note) <= 1000),
  visible_to_sender boolean not null default true,
  visible_to_gp boolean not null default true,
  visible_to_recipient boolean not null default false,
  created_at timestamptz not null default now()
);

create index passport_events_booking_idx on public.passport_events (booking_id, occurred_at);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('delay', 'damaged_parcel', 'missing_parcel', 'handover', 'conduct', 'other')),
  description text not null check (char_length(description) between 1 and 3000),
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'closed')),
  resolution text check (resolution is null or char_length(resolution) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index incidents_booking_idx on public.incidents (booking_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Updated timestamp helper; no client can use it to elevate privileges.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
create trigger parcel_requests_set_updated_at before update on public.parcel_requests
  for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
create trigger incidents_set_updated_at before update on public.incidents
  for each row execute function public.set_updated_at();

-- New account profile: profile data is private by default.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.corridors enable row level security;
alter table public.trips enable row level security;
alter table public.parcel_requests enable row level security;
alter table public.bookings enable row level security;
alter table public.passport_events enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_logs enable row level security;

-- Profile rows are private. Users cannot set status through client-side grants.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, phone, country_code) on public.profiles to authenticated;

-- Public/anonymous read is limited to active corridors. Writes remain server/admin-only.
create policy corridors_read_active on public.corridors
  for select to anon, authenticated using (is_active = true);
revoke all on public.corridors from anon, authenticated;
-- Explicit column grants avoid exposing internal validation_notes to ordinary clients.
grant select (id, origin_country_code, destination_country_code, origin_label,
  destination_label, is_active, rules_url) on public.corridors to anon, authenticated;

-- Only published trips on active corridors are public. GP can read their own drafts.
create policy trips_read_published_or_owner on public.trips
  for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.corridors c where c.id = corridor_id and c.is_active = true
    ))
    or gp_id = (select auth.uid())
  );
create policy trips_insert_own_draft on public.trips
  for insert to authenticated
  with check (
    gp_id = (select auth.uid())
    and status = 'draft'
    and capacity_remaining_kg = capacity_total_kg
  );
grant select on public.trips to anon, authenticated;
grant insert (gp_id, corridor_id, origin_city, destination_city, departure_at, arrival_at,
  capacity_total_kg, capacity_remaining_kg, currency, price_per_kg, conditions, status)
  on public.trips to authenticated;
-- No direct trip update/delete until safe server-side lifecycle functions exist.
revoke update, delete on public.trips from anon, authenticated;

-- Sender requests are private; only the owner can create/read their own request.
create policy parcel_requests_read_own on public.parcel_requests
  for select to authenticated using (sender_id = (select auth.uid()));
create policy parcel_requests_insert_own on public.parcel_requests
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and status = 'open'
  );
grant select, insert on public.parcel_requests to authenticated;
revoke update, delete on public.parcel_requests from anon, authenticated;

-- Booking mutations are server-side only; participants can read their own bookings.
create policy bookings_read_participants on public.bookings
  for select to authenticated using (
    sender_id = (select auth.uid()) or gp_id = (select auth.uid())
  );
grant select on public.bookings to authenticated;
revoke insert, update, delete on public.bookings from anon, authenticated;

-- Passport is append-only for end users; participant-specific visibility is enforced on reads.
create policy passport_read_participants on public.passport_events
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          (b.sender_id = (select auth.uid()) and visible_to_sender)
          or (b.gp_id = (select auth.uid()) and visible_to_gp)
        )
    )
  );
grant select on public.passport_events to authenticated;
revoke insert, update, delete on public.passport_events from anon, authenticated;

-- Only a booking participant may read/create an incident for that booking.
create policy incidents_read_participants on public.incidents
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.sender_id = (select auth.uid()) or b.gp_id = (select auth.uid()))
    )
  );
create policy incidents_insert_participant on public.incidents
  for insert to authenticated with check (
    opened_by = (select auth.uid())
    and status = 'open'
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.sender_id = (select auth.uid()) or b.gp_id = (select auth.uid()))
    )
  );
grant select, insert on public.incidents to authenticated;
revoke update, delete on public.incidents from anon, authenticated;

-- Audit logs are never exposed to ordinary clients.
revoke all on public.audit_logs from anon, authenticated;

commit;
