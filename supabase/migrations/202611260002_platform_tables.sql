-- JotColis — socle de données de la plateforme (2026-11-26).
-- Migration ADDITIVE : aucune table, colonne ou ligne existante n'est supprimée.
-- Toutes les écritures sensibles passent par des RPC SECURITY DEFINER contrôlées.
begin;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rôles, vérification GP, conformité, notifications, remise, incidents
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('sender', 'gp', 'recipient', 'admin', 'gp_applicant')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text
);
create unique index if not exists user_roles_active_uidx
  on public.user_roles (user_id, role) where revoked_at is null;
create index if not exists user_roles_user_idx on public.user_roles (user_id);

create table if not exists public.gp_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'not_submitted'
    check (status in ('not_submitted','pending','in_review','approved','rejected','suspended','expired')),
  legal_first_name text check (legal_first_name is null or char_length(legal_first_name) between 1 and 80),
  legal_last_name text check (legal_last_name is null or char_length(legal_last_name) between 1 and 80),
  phone text check (phone is null or char_length(phone) between 6 and 30),
  identity_status text not null default 'not_checked'
    check (identity_status in ('not_checked','pending','checked','failed')),
  contact_status text not null default 'not_checked'
    check (contact_status in ('not_checked','pending','checked','failed')),
  travel_status text not null default 'not_checked'
    check (travel_status in ('not_checked','pending','checked','failed')),
  documents_status text not null default 'not_checked'
    check (documents_status in ('not_checked','pending','checked','failed')),
  travel_departure_at timestamptz,
  travel_destination text check (travel_destination is null or char_length(travel_destination) between 1 and 120),
  travel_capacity_kg numeric(8,2) check (travel_capacity_kg is null or travel_capacity_kg > 0),
  travel_reference text check (travel_reference is null or char_length(travel_reference) <= 200),
  justification_note text check (justification_note is null or char_length(justification_note) <= 1000),
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_notes text check (review_notes is null or char_length(review_notes) <= 2000),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gp_verification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists gp_verification_events_user_idx
  on public.gp_verification_events (user_id, created_at desc);

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('identity','travel_proof','address_proof','other')),
  storage_bucket text not null default 'gp-documents',
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  content_type text check (content_type is null or char_length(content_type) <= 120),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  unique (user_id, storage_path)
);
create index if not exists verification_documents_user_idx
  on public.verification_documents (user_id, uploaded_at desc);

create table if not exists public.platform_config (
  key text primary key check (char_length(key) between 1 and 80),
  value jsonb not null default 'null'::jsonb,
  description text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_validations (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (jurisdiction in ('FR','SN','EU','OTHER')),
  scope text not null check (scope in ('business_model','transport_rules','customs','airline','insurance','privacy','terms')),
  professional_name text not null check (char_length(professional_name) between 2 and 160),
  document_ref text not null check (char_length(document_ref) between 3 and 300),
  validated_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (jurisdiction, scope, document_ref)
);

create table if not exists public.prohibited_categories (
  code text primary key check (code ~ '^[a-z0-9_-]{2,60}$'),
  label text not null check (char_length(label) between 2 and 200),
  restriction text not null check (restriction in ('prohibited','restricted','requires_declaration')),
  rationale text not null default '',
  is_legally_validated boolean not null default false,
  validation_reference text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  origin_city text not null check (char_length(origin_city) between 1 and 120),
  destination_city text not null check (char_length(destination_city) between 1 and 120),
  desired_date date,
  contact text not null check (char_length(contact) between 3 and 160),
  consent_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','matched','cancelled','expired')),
  matched_trip_id uuid references public.trips(id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trip_alerts_route_idx
  on public.trip_alerts (origin_city, destination_city, status);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (char_length(event_key) between 3 and 200),
  event_type text not null check (char_length(event_type) between 3 and 120),
  recipient_user_id uuid references public.profiles(id) on delete set null,
  recipient_contact text,
  channel text not null check (channel in ('in_app','email','whatsapp')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','claimed','sent','failed','blocked','dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  claimed_by text,
  claim_token uuid,
  provider text,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists notification_outbox_due_idx
  on public.notification_outbox (status, next_attempt_at);
create index if not exists notification_outbox_recipient_idx
  on public.notification_outbox (recipient_user_id, created_at desc);

-- Compatibilité avec une base où la table existait avant l'ajout du bail.
alter table public.notification_outbox add column if not exists claim_expires_at timestamptz;
alter table public.notification_outbox add column if not exists claimed_by text;
create index if not exists notification_outbox_claim_expiry_idx
  on public.notification_outbox (claim_expires_at) where status = 'claimed';

create table if not exists public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_outbox(id) on delete cascade,
  attempt_no integer not null,
  status text not null check (status in ('sent','failed','skipped','blocked')),
  provider text,
  http_status integer,
  error_code text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (notification_id, attempt_no)
);

-- États serveur des canaux externes. Aucune valeur de secret n'est stockée ici :
-- secrets_present est un booléen calculé exclusivement par l'Edge Function serveur.
create table if not exists public.notification_provider_states (
  channel text primary key check (channel in ('email', 'whatsapp')),
  declared_provider_name text check (declared_provider_name is null or char_length(declared_provider_name) between 2 and 120),
  declared_active boolean not null default false,
  declared_by uuid references public.profiles(id) on delete set null,
  declared_at timestamptz,
  server_state text not null default 'non_configure'
    check (server_state in ('non_configure', 'configure', 'teste', 'operationnel', 'en_erreur')),
  secrets_present boolean not null default false,
  last_secret_check_at timestamptz,
  last_provider_message_id text
    check (last_provider_message_id is null or char_length(last_provider_message_id) between 1 and 200),
  last_provider_test_at timestamptz,
  operational_at timestamptz,
  last_error text check (last_error is null or last_error ~ '^[A-Za-z0-9_]{1,120}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_provider_states (channel, server_state, last_error) values
  ('email', 'non_configure', 'SERVER_SECRETS_MISSING'),
  ('whatsapp', 'non_configure', 'SERVER_SECRETS_MISSING')
on conflict (channel) do nothing;

create table if not exists public.delivery_codes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  parcel_code text not null,
  code_salt text not null,
  code_hash text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.incident_notes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null check (char_length(note) between 1 and 3000),
  is_internal boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists incident_notes_incident_idx
  on public.incident_notes (incident_id, created_at desc);

create table if not exists public.incident_evidence (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  storage_bucket text not null default 'incident-evidence',
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Règles explicites de transition : aucune modification de statut n'est libre.
create table if not exists public.booking_event_rules (
  event_type public.passport_event_type not null,
  from_status public.booking_status not null,
  to_status public.booking_status not null,
  allowed_actor text not null check (allowed_actor in ('gp','sender','admin','participant','system')),
  public_label text not null,
  public_event boolean not null default false,
  primary key (event_type, from_status)
);

-- ---------------------------------------------------------------------------
-- Colonnes additionnelles sur le schéma existant
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists profile_completed_at timestamptz;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.profiles add column if not exists deactivated_at timestamptz;
alter table public.profiles add column if not exists deactivation_reason text;

alter table public.corridors add column if not exists legal_validation_ref text;
alter table public.corridors add column if not exists activated_at timestamptz;
alter table public.corridors add column if not exists activated_by uuid references public.profiles(id) on delete set null;

alter table public.trips add column if not exists published_at timestamptz;
alter table public.trips add column if not exists cancelled_at timestamptz;
alter table public.trips add column if not exists suspended_at timestamptz;
alter table public.trips add column if not exists suspension_reason text;
alter table public.trips add column if not exists last_capacity_change_at timestamptz;
alter table public.trips add column if not exists version integer not null default 1;

alter table public.parcel_requests add column if not exists trip_id uuid references public.trips(id) on delete restrict;
alter table public.parcel_requests add column if not exists parcel_code text;
alter table public.parcel_requests add column if not exists recipient_name text;
alter table public.parcel_requests add column if not exists recipient_contact text;
alter table public.parcel_requests add column if not exists sender_contact text;
alter table public.parcel_requests add column if not exists declared_content text;
alter table public.parcel_requests add column if not exists terms_accepted_at timestamptz;
alter table public.parcel_requests add column if not exists prohibited_confirmed_at timestamptz;
alter table public.parcel_requests add column if not exists idempotency_key text;
alter table public.parcel_requests add column if not exists submitted_at timestamptz;
alter table public.parcel_requests add column if not exists decided_at timestamptz;
alter table public.parcel_requests add column if not exists decision_note text;
alter table public.parcel_requests add column if not exists cancelled_at timestamptz;
alter table public.parcel_requests alter column status set default 'draft';

alter table public.bookings add column if not exists parcel_code text;
alter table public.bookings add column if not exists capacity_reserved_kg numeric(8,2);
alter table public.bookings add column if not exists price_per_kg numeric(10,2);
alter table public.bookings add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;
alter table public.bookings add column if not exists confirmed_at timestamptz;
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists capacity_released_at timestamptz;
alter table public.bookings add column if not exists cancellation_reason text;
alter table public.bookings add column if not exists delivered_at timestamptz;
alter table public.bookings add column if not exists disputed_at timestamptz;
alter table public.bookings add column if not exists pickup_ready_at timestamptz;

alter table public.passport_events alter column booking_id drop not null;
alter table public.passport_events add column if not exists request_id uuid references public.parcel_requests(id) on delete restrict;
alter table public.passport_events add column if not exists parcel_code text;
alter table public.passport_events add column if not exists sequence_no bigint;
alter table public.passport_events add column if not exists prev_hash text;
alter table public.passport_events add column if not exists event_hash text;
alter table public.passport_events add column if not exists visible_to_public boolean not null default false;
alter table public.passport_events add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.incidents add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.incidents add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','critical'));
alter table public.incidents add column if not exists escalated_at timestamptz;
alter table public.incidents add column if not exists closed_at timestamptz;
alter table public.incidents add column if not exists internal_reference text;

alter table public.audit_logs add column if not exists actor_role text;
alter table public.audit_logs add column if not exists correlation_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'passport_events_target_chk' and conrelid = 'public.passport_events'::regclass
  ) then
    alter table public.passport_events add constraint passport_events_target_chk
      check (booking_id is not null or request_id is not null);
  end if;
end $$;

create unique index if not exists parcel_requests_code_uidx on public.parcel_requests (parcel_code);
create unique index if not exists bookings_code_uidx on public.bookings (parcel_code);
create unique index if not exists bookings_request_uidx on public.bookings (parcel_request_id);
create unique index if not exists parcel_requests_idempotency_uidx
  on public.parcel_requests (sender_id, trip_id, idempotency_key)
  where idempotency_key is not null and trip_id is not null;
create index if not exists parcel_requests_trip_idx on public.parcel_requests (trip_id, status);
create index if not exists passport_events_request_idx on public.passport_events (request_id, sequence_no);
create index if not exists passport_events_public_idx on public.passport_events (parcel_code, sequence_no)
  where visible_to_public = true;
create index if not exists trips_available_idx
  on public.trips (origin_city, destination_city, departure_at)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- Helpers d'autorisation (jamais basés sur user_metadata)
-- ---------------------------------------------------------------------------

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select true
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and r.role = 'admin'
      and r.revoked_at is null
      and p.status = 'active'
    limit 1
  ), false);
$$;

-- Inscription : profil privé + rôle expéditeur. Aucun rôle admin n'est attribué ici.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role, granted_by)
  values (new.id, 'sender', null)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS : activation systématique, aucune désactivation
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.corridors enable row level security;
alter table public.trips enable row level security;
alter table public.parcel_requests enable row level security;
alter table public.bookings enable row level security;
alter table public.passport_events enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.user_roles enable row level security;
alter table public.gp_verifications enable row level security;
alter table public.gp_verification_events enable row level security;
alter table public.verification_documents enable row level security;
alter table public.platform_config enable row level security;
alter table public.legal_validations enable row level security;
alter table public.prohibited_categories enable row level security;
alter table public.trip_alerts enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_provider_states enable row level security;
-- Aucune policy client : la table n'est lisible que via les RPC SECURITY DEFINER contrôlées.
alter table public.notification_attempts enable row level security;
alter table public.delivery_codes enable row level security;
alter table public.incident_notes enable row level security;
alter table public.incident_evidence enable row level security;
alter table public.booking_event_rules enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_user_is_admin());
drop policy if exists profiles_update_own on public.profiles;

drop policy if exists corridors_read_active on public.corridors;
create policy corridors_read_active on public.corridors for select to anon, authenticated
  using (is_active = true or public.current_user_is_admin());

drop policy if exists trips_read_published_or_owner on public.trips;
create policy trips_read_published_or_owner on public.trips for select to anon, authenticated
  using (
    gp_id = auth.uid()
    or public.current_user_is_admin()
    or (status = 'published' and exists (
      select 1 from public.corridors c where c.id = corridor_id and c.is_active = true
    ))
  );
drop policy if exists trips_insert_own_draft on public.trips;

drop policy if exists parcel_requests_read_own on public.parcel_requests;
create policy parcel_requests_read_own on public.parcel_requests for select to authenticated
  using (
    sender_id = auth.uid()
    or public.current_user_is_admin()
    or exists (
      select 1 from public.trips t where t.id = trip_id and t.gp_id = auth.uid()
    )
  );
drop policy if exists parcel_requests_insert_own on public.parcel_requests;

drop policy if exists bookings_read_participants on public.bookings;
create policy bookings_read_participants on public.bookings for select to authenticated
  using (sender_id = auth.uid() or gp_id = auth.uid() or public.current_user_is_admin());

drop policy if exists passport_read_participants on public.passport_events;
create policy passport_read_participants on public.passport_events for select to authenticated
  using (
    public.current_user_is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and ((b.sender_id = auth.uid() and visible_to_sender) or (b.gp_id = auth.uid() and visible_to_gp))
    )
    or exists (
      select 1 from public.parcel_requests r
      where r.id = request_id and r.sender_id = auth.uid() and visible_to_sender
    )
  );

drop policy if exists incidents_read_participants on public.incidents;
create policy incidents_read_participants on public.incidents for select to authenticated
  using (
    public.current_user_is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id and (b.sender_id = auth.uid() or b.gp_id = auth.uid())
    )
  );
drop policy if exists incidents_insert_participant on public.incidents;

create policy user_roles_select_own_admin on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
create policy gp_verifications_select_own_admin on public.gp_verifications for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
create policy gp_verification_events_select_own_admin on public.gp_verification_events for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
create policy verification_documents_select_own_admin on public.verification_documents for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
create policy trip_alerts_select_own_admin on public.trip_alerts for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
create policy notification_outbox_select_admin on public.notification_outbox for select to authenticated
  using (public.current_user_is_admin());
create policy notification_attempts_select_admin on public.notification_attempts for select to authenticated
  using (public.current_user_is_admin());
create policy delivery_codes_select_admin on public.delivery_codes for select to authenticated
  using (public.current_user_is_admin());
create policy incident_notes_select_participant_admin on public.incident_notes for select to authenticated
  using (
    public.current_user_is_admin()
    or (is_internal = false and exists (
      select 1 from public.incidents i
      join public.bookings b on b.id = i.booking_id
      where i.id = incident_id and (b.sender_id = auth.uid() or b.gp_id = auth.uid())
    ))
  );
create policy incident_evidence_select_participant_admin on public.incident_evidence for select to authenticated
  using (
    public.current_user_is_admin()
    or exists (
      select 1 from public.incidents i
      join public.bookings b on b.id = i.booking_id
      where i.id = incident_id and (b.sender_id = auth.uid() or b.gp_id = auth.uid())
    )
  );
create policy prohibited_categories_select_all on public.prohibited_categories for select to anon, authenticated using (true);
create policy platform_config_select_all on public.platform_config for select to anon, authenticated using (true);
create policy legal_validations_select_admin on public.legal_validations for select to authenticated
  using (public.current_user_is_admin());
create policy booking_event_rules_select_all on public.booking_event_rules for select to authenticated using (true);
create policy audit_logs_select_admin on public.audit_logs for select to authenticated
  using (public.current_user_is_admin());

-- ---------------------------------------------------------------------------
-- Vues contrôlées : aucune donnée personnelle ni secret n'est exposé
-- ---------------------------------------------------------------------------

create or replace view public.available_trips with (security_barrier = true) as
select
  t.id,
  t.origin_city,
  t.destination_city,
  t.departure_at,
  t.capacity_remaining_kg,
  t.currency,
  t.price_per_kg,
  t.conditions,
  c.origin_label,
  c.destination_label,
  t.published_at,
  'approved'::text as gp_verification_status
from public.trips t
join public.corridors c on c.id = t.corridor_id
join public.gp_verifications v on v.user_id = t.gp_id
join public.profiles p on p.id = t.gp_id
where t.status = 'published'
  and c.is_active = true
  and t.departure_at > now()
  and t.capacity_remaining_kg > 0
  and v.status = 'approved'
  and (v.expires_at is null or v.expires_at > now())
  and p.status = 'active'
  and p.gp_approved = true;

create or replace view public.my_notifications with (security_barrier = true) as
select
  id, event_type, channel, status, provider, attempts,
  created_at, sent_at, last_error
from public.notification_outbox
where recipient_user_id = auth.uid();

create or replace view public.delivery_code_status with (security_barrier = true) as
select
  dc.booking_id,
  b.parcel_code,
  dc.issued_at,
  dc.expires_at,
  dc.attempts,
  dc.max_attempts,
  dc.used_at,
  dc.revoked_at
from public.delivery_codes dc
join public.bookings b on b.id = dc.booking_id
where b.sender_id = auth.uid()
   or b.gp_id = auth.uid()
   or public.current_user_is_admin();

-- ---------------------------------------------------------------------------
-- Immutabilité et chaîne de hachage du passeport
-- ---------------------------------------------------------------------------

create or replace function public.reject_immutable_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'IMMUTABLE_RECORD' using errcode = '55000';
end;
$$;

create or replace function public.passport_hash_chain()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prev text;
  v_seq bigint;
  v_canonical text;
begin
  -- La chaîne suit le colis (parcel_code), y compris quand les premiers
  -- événements portent sur la demande puis les suivants sur la réservation.
  select pe.event_hash, pe.sequence_no into v_prev, v_seq
  from public.passport_events pe
  where pe.parcel_code = new.parcel_code
  order by pe.sequence_no desc nulls last
  limit 1;

  new.sequence_no := coalesce(v_seq, 0) + 1;
  new.prev_hash := v_prev;
  v_canonical := jsonb_build_object(
    'parcel', coalesce(new.parcel_code, ''),
    'seq', new.sequence_no,
    'prev', coalesce(v_prev, ''),
    'type', new.event_type::text,
    'at', new.occurred_at,
    'actor', coalesce(new.actor_id::text, ''),
    'source', new.source,
    'note', coalesce(new.note, ''),
    'payload', coalesce(new.payload, '{}'::jsonb)
  )::text;
  new.event_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_canonical, 'UTF8')), 'hex'
  );
  return new;
end;
$$;

drop trigger if exists passport_events_hash_chain on public.passport_events;
create trigger passport_events_hash_chain before insert on public.passport_events
  for each row execute function public.passport_hash_chain();

drop trigger if exists passport_events_immutable on public.passport_events;
create trigger passport_events_immutable before update or delete on public.passport_events
  for each row execute function public.reject_immutable_change();
drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.reject_immutable_change();
drop trigger if exists notification_attempts_immutable on public.notification_attempts;
create trigger notification_attempts_immutable before update or delete on public.notification_attempts
  for each row execute function public.reject_immutable_change();
drop trigger if exists gp_verification_events_immutable on public.gp_verification_events;
create trigger gp_verification_events_immutable before update or delete on public.gp_verification_events
  for each row execute function public.reject_immutable_change();

drop trigger if exists gp_verifications_set_updated_at on public.gp_verifications;
create trigger gp_verifications_set_updated_at before update on public.gp_verifications
  for each row execute function public.set_updated_at();
drop trigger if exists trip_alerts_set_updated_at on public.trip_alerts;
create trigger trip_alerts_set_updated_at before update on public.trip_alerts
  for each row execute function public.set_updated_at();
drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at before update on public.notification_outbox
  for each row execute function public.set_updated_at();
drop trigger if exists notification_provider_states_set_updated_at on public.notification_provider_states;
create trigger notification_provider_states_set_updated_at before update on public.notification_provider_states
  for each row execute function public.set_updated_at();
drop trigger if exists prohibited_categories_set_updated_at on public.prohibited_categories;
create trigger prohibited_categories_set_updated_at before update on public.prohibited_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Valeurs par défaut : tout est fermé jusqu'à validation explicite
-- ---------------------------------------------------------------------------

insert into public.platform_config (key, value, description) values
  ('commercial_open', 'false'::jsonb, 'Ouverture des transports réels. Exige des validations juridiques documentées.'),
  ('legal_validation_complete', 'false'::jsonb, 'Validations FR et SN du modèle économique et juridique enregistrées.'),
  ('notifications_enabled', 'false'::jsonb, 'Valeur DÉRIVÉE : au moins un canal serveur opérationnel confirmé.'),
  ('email_provider_configured', 'false'::jsonb, 'Valeur DÉRIVÉE : secrets serveur détectés, jamais une déclaration admin.'),
  ('whatsapp_provider_configured', 'false'::jsonb, 'Valeur DÉRIVÉE : secrets serveur détectés, jamais une déclaration admin.'),
  ('email_provider_state', '"non_configure"'::jsonb, 'État serveur : non configuré / configuré / testé / opérationnel / en erreur.'),
  ('whatsapp_provider_state', '"non_configure"'::jsonb, 'État serveur : non configuré / configuré / testé / opérationnel / en erreur.'),
  ('pricing_config_validated', 'false'::jsonb, 'Tarifs et commissions validés commercialement. Aucun tarif n est inventé.'),
  ('delivery_code_ttl_hours', '48'::jsonb, 'Durée de validité d un code de remise.'),
  ('delivery_code_max_attempts', '5'::jsonb, 'Nombre maximal de tentatives de code.'),
  ('request_duplicate_window_minutes', '10'::jsonb, 'Fenêtre anti-doublon des demandes.'),
  ('notification_max_attempts', '5'::jsonb, 'Nombre maximal de tentatives d envoi externe.'),
  ('notification_retry_minutes', '15'::jsonb, 'Délai de base entre deux tentatives.')
on conflict (key) do nothing;

-- Corrige les descriptions si une version antérieure de ces clés existait déjà,
-- sans modifier les valeurs d'exploitation.
update public.platform_config set description = 'Valeur DÉRIVÉE : au moins un canal serveur opérationnel confirmé.'
  where key = 'notifications_enabled';
update public.platform_config set description = 'Valeur DÉRIVÉE : secrets serveur détectés, jamais une déclaration admin.'
  where key in ('email_provider_configured', 'whatsapp_provider_configured');

insert into public.prohibited_categories (code, label, restriction, rationale) values
  ('narcotics', 'Stupéfiants et substances illégales', 'prohibited', 'Liste indicative, non validée juridiquement.'),
  ('weapons', 'Armes, munitions et objets dangereux', 'prohibited', 'Liste indicative, non validée juridiquement.'),
  ('dangerous_goods', 'Produits inflammables, explosifs, aérosols, batteries endommagées', 'prohibited', 'Règles aériennes et IATA à vérifier par un spécialiste.'),
  ('cash', 'Espèces, cartes bancaires et titres au porteur', 'prohibited', 'Risque de fraude et règles de transport à vérifier.'),
  ('counterfeit', 'Contrefaçons et marchandises interdites à l importation', 'prohibited', 'Réglementation douanière FR/SN à vérifier.'),
  ('medicines', 'Médicaments sans ordonnance ou non autorisés', 'restricted', 'Réglementation pharmaceutique FR/SN à vérifier.'),
  ('perishables', 'Denrées périssables non autorisées', 'restricted', 'Réglementation sanitaire et douanière à vérifier.'),
  ('identity_docs', 'Documents d identité de tiers', 'prohibited', 'Protection des données personnelles.'),
  ('lithium', 'Batteries lithium et appareils contenant des batteries', 'restricted', 'Règles compagnies aériennes à vérifier.'),
  ('alcohol_tobacco', 'Alcool, tabac et produits soumis à accise', 'requires_declaration', 'Douanes et limites voyageur à vérifier.')
on conflict (code) do nothing;

insert into public.booking_event_rules
  (event_type, from_status, to_status, allowed_actor, public_label, public_event) values
  ('parcel_received','confirmed','in_preparation','gp','Colis pris en charge',true),
  ('inspection_recorded','confirmed','confirmed','gp','Contrôle du contenu déclaré',false),
  ('inspection_recorded','in_preparation','in_preparation','gp','Contrôle du contenu déclaré',false),
  ('departure_reported','in_preparation','in_transit','gp','Départ confirmé',true),
  ('arrival_reported','in_transit','arrived','gp','Arrivée confirmée',true),
  ('ready_for_pickup','arrived','ready_for_pickup','gp','Colis disponible pour remise',true),
  ('handover_reported','arrived','ready_for_pickup','gp','Colis disponible pour remise',true),
  ('handover_reported','ready_for_pickup','ready_for_pickup','gp','Remise préparée',false),
  ('incident_opened','confirmed','disputed','participant','Incident signalé',false),
  ('incident_opened','in_preparation','disputed','participant','Incident signalé',false),
  ('incident_opened','in_transit','disputed','participant','Incident signalé',false),
  ('incident_opened','arrived','disputed','participant','Incident signalé',false),
  ('incident_opened','ready_for_pickup','disputed','participant','Incident signalé',false)
on conflict (event_type, from_status) do nothing;

commit;
