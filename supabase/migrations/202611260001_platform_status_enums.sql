-- JotColis — extension non destructive des statuts métier (2026-11-26).
-- Aucune donnée existante n'est modifiée. Les nouvelles valeurs ne sont PAS utilisées
-- dans cette migration : PostgreSQL interdit d'utiliser une valeur ajoutée dans la
-- même transaction. Les fonctions qui les emploient sont dans les migrations suivantes.
-- PostgreSQL 17/Supabase autorise ALTER TYPE ... ADD VALUE IF NOT EXISTS dans une transaction,
-- mais une valeur ajoutée n'est utilisable qu'après COMMIT : cette migration doit donc rester
-- la première du lot et être validée avant 002/003/004. Aucune valeur existante n'est retirée.
begin;

do $$
begin
  if to_regtype('public.account_status') is null then
    create type public.account_status as enum ('active', 'suspended', 'closed');
  end if;
  if to_regtype('public.trip_status') is null then
    create type public.trip_status as enum ('draft', 'published', 'cancelled', 'completed');
  end if;
  if to_regtype('public.request_status') is null then
    create type public.request_status as enum ('open', 'matched', 'cancelled', 'expired');
  end if;
  if to_regtype('public.booking_status') is null then
    create type public.booking_status as enum ('pending', 'confirmed', 'in_transit', 'delivered', 'cancelled', 'disputed');
  end if;
  if to_regtype('public.passport_event_type') is null then
    create type public.passport_event_type as enum (
      'booking_created', 'booking_confirmed', 'parcel_received',
      'departure_reported', 'arrival_reported', 'handover_reported',
      'delivery_confirmed', 'incident_opened', 'correction'
    );
  end if;
end $$;

alter type public.trip_status add value if not exists 'expired';
alter type public.trip_status add value if not exists 'suspended';

alter type public.request_status add value if not exists 'draft';
alter type public.request_status add value if not exists 'submitted';
alter type public.request_status add value if not exists 'awaiting_gp';
alter type public.request_status add value if not exists 'accepted';
alter type public.request_status add value if not exists 'rejected';
alter type public.request_status add value if not exists 'awaiting_confirmation';
alter type public.request_status add value if not exists 'confirmed';
alter type public.request_status add value if not exists 'in_preparation';
alter type public.request_status add value if not exists 'in_transit';
alter type public.request_status add value if not exists 'arrived';
alter type public.request_status add value if not exists 'ready_for_pickup';
alter type public.request_status add value if not exists 'delivered';
alter type public.request_status add value if not exists 'disputed';

alter type public.booking_status add value if not exists 'awaiting_confirmation';
alter type public.booking_status add value if not exists 'in_preparation';
alter type public.booking_status add value if not exists 'arrived';
alter type public.booking_status add value if not exists 'ready_for_pickup';
alter type public.booking_status add value if not exists 'suspended';

alter type public.passport_event_type add value if not exists 'request_created';
alter type public.passport_event_type add value if not exists 'request_accepted';
alter type public.passport_event_type add value if not exists 'request_rejected';
alter type public.passport_event_type add value if not exists 'booking_cancelled';
alter type public.passport_event_type add value if not exists 'capacity_reserved';
alter type public.passport_event_type add value if not exists 'capacity_released';
alter type public.passport_event_type add value if not exists 'inspection_recorded';
alter type public.passport_event_type add value if not exists 'ready_for_pickup';
alter type public.passport_event_type add value if not exists 'delivery_code_issued';
alter type public.passport_event_type add value if not exists 'delivery_attempt_failed';
alter type public.passport_event_type add value if not exists 'admin_handover';
alter type public.passport_event_type add value if not exists 'incident_resolved';
alter type public.passport_event_type add value if not exists 'trip_published';
alter type public.passport_event_type add value if not exists 'trip_updated';
alter type public.passport_event_type add value if not exists 'trip_cancelled';
alter type public.passport_event_type add value if not exists 'gp_verification_submitted';
alter type public.passport_event_type add value if not exists 'gp_verification_approved';
alter type public.passport_event_type add value if not exists 'gp_verification_rejected';

commit;
