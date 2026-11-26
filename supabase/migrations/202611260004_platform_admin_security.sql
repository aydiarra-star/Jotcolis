-- JotColis — administration, notifications asynchrones, stockage privé et moindres privilèges.
-- Aucun secret, aucun prestataire et aucun envoi externe ne sont activés par cette migration.
begin;

-- ---------------------------------------------------------------------------
-- Amorçage du premier administrateur : réservé au SQL Editor / service_role.
-- Jamais appelable depuis le navigateur : aucun utilisateur ne peut s'auto-promouvoir.
-- ---------------------------------------------------------------------------

create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'AUTH_USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.user_roles r
    where r.role = 'admin' and r.revoked_at is null
  ) then
    raise exception 'ADMIN_ALREADY_EXISTS' using errcode = '42501';
  end if;
  insert into public.profiles (id) values (p_user_id) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role, granted_by)
  values (p_user_id, 'admin', null)
  on conflict do nothing;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (p_user_id, 'system', 'admin_bootstrap', 'user_role', p_user_id::text,
          jsonb_build_object('method', 'privileged_sql_only'));
end;
$$;

-- Les drapeaux publics ne sont jamais écrits par un administrateur : ils sont
-- dérivés des états serveur. Aucun secret, identifiant de message ou contact
-- n'est stocké dans platform_config.
create or replace function public.sync_notification_provider_state()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
  v_email_ready boolean;
  v_whatsapp_ready boolean;
  v_email_state text;
  v_whatsapp_state text;
begin
  select
    coalesce(bool_or(server_state = 'operationnel' and declared_active and secrets_present), false),
    coalesce(bool_or(channel = 'email' and server_state in ('configure', 'teste', 'operationnel') and declared_active and secrets_present), false),
    coalesce(bool_or(channel = 'whatsapp' and server_state in ('configure', 'teste', 'operationnel') and declared_active and secrets_present), false)
  into v_active, v_email_ready, v_whatsapp_ready
  from public.notification_provider_states;

  select server_state into v_email_state from public.notification_provider_states where channel = 'email';
  select server_state into v_whatsapp_state from public.notification_provider_states where channel = 'whatsapp';

  insert into public.platform_config (key, value, description, updated_by, updated_at) values
    ('notifications_enabled', to_jsonb(v_active), 'Valeur DÉRIVÉE : au moins un canal serveur opérationnel confirmé.', null, now()),
    ('email_provider_configured', to_jsonb(v_email_ready), 'Valeur DÉRIVÉE : secrets serveur détectés, jamais une déclaration admin.', null, now()),
    ('whatsapp_provider_configured', to_jsonb(v_whatsapp_ready), 'Valeur DÉRIVÉE : secrets serveur détectés, jamais une déclaration admin.', null, now()),
    ('email_provider_state', to_jsonb(coalesce(v_email_state, 'non_configure')), 'État serveur du canal e-mail.', null, now()),
    ('whatsapp_provider_state', to_jsonb(coalesce(v_whatsapp_state, 'non_configure')), 'État serveur du canal WhatsApp.', null, now())
  on conflict (key) do update
    set value = excluded.value, description = excluded.description,
        updated_by = null, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Worker de notifications : revendication et résultat, uniquement service_role.
-- Aucun message n'est marqué « envoyé » sans réponse 2xx d'un prestataire réel.
-- ---------------------------------------------------------------------------

create or replace function public.claim_notifications(
  p_limit integer default 20,
  p_worker_id text default null
)
returns table (
  id uuid,
  event_key text,
  event_type text,
  channel text,
  recipient_contact text,
  payload jsonb,
  status text,
  claim_token uuid,
  attempt_no integer,
  claim_expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  -- Qualification explicite : les noms de colonnes de retour sont aussi des
  -- variables PL/pgSQL et doivent rester non ambigus.
  update public.notification_provider_states s
  set server_state = 'en_erreur',
      last_error = 'CLAIM_TIMEOUT_MANUAL_RECONCILIATION',
      operational_at = null,
      updated_at = now()
  where s.channel in (
    select distinct n.channel from public.notification_outbox n
    where n.status = 'claimed' and n.claim_expires_at <= now()
  ) and s.channel in ('email', 'whatsapp');

  update public.notification_outbox n
  set status = 'blocked',
      last_error = 'CLAIM_TIMEOUT_MANUAL_RECONCILIATION',
      claim_token = null,
      claimed_at = null,
      claim_expires_at = null,
      claimed_by = null,
      next_attempt_at = now()
  where n.status = 'claimed' and n.claim_expires_at <= now();
  perform public.sync_notification_provider_state();

  return query
  with due as (
    select n.id
    from public.notification_outbox n
    where n.status in ('pending', 'failed')
      and n.next_attempt_at <= now()
      and n.attempts < n.max_attempts
      and n.channel in ('email', 'whatsapp')
      and public.notification_channel_is_operational(n.channel)
    order by n.next_attempt_at asc
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update public.notification_outbox n
    set status = 'claimed',
        claimed_at = now(),
        claim_expires_at = now() + interval '2 minutes',
        claimed_by = nullif(trim(coalesce(p_worker_id, '')), ''),
        claim_token = gen_random_uuid(),
        attempts = n.attempts + 1
    from due d
    where n.id = d.id
    returning n.*
  )
  select c.id, c.event_key, c.event_type, c.channel, c.recipient_contact,
         c.payload, c.status, c.claim_token, c.attempts, c.claim_expires_at
  from claimed c;
end;
$$;

create or replace function public.record_notification_result(
  p_notification_id uuid,
  p_claim_token uuid,
  p_status text,
  p_provider text default null,
  p_provider_message_id text default null,
  p_http_status integer default null,
  p_error_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.notification_outbox%rowtype;
  v_retry integer := public.config_int('notification_retry_minutes', 15);
  v_new_status text;
begin
  if p_status not in ('sent', 'failed', 'skipped', 'blocked') then
    raise exception 'INVALID_NOTIFICATION_STATUS' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_]{1,120}$' then
    raise exception 'INVALID_ERROR_CODE' using errcode = '22023';
  end if;
  if p_provider is not null and p_provider !~ '^[A-Za-z0-9._-]{2,80}$' then
    raise exception 'INVALID_PROVIDER_NAME' using errcode = '22023';
  end if;
  if p_provider_message_id is not null and p_provider_message_id !~ '^[A-Za-z0-9._:-]{1,200}$' then
    raise exception 'INVALID_PROVIDER_MESSAGE_ID' using errcode = '22023';
  end if;

  select n.* into v_row from public.notification_outbox n
  where n.id = p_notification_id for update;
  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.status <> 'claimed' or v_row.claim_token is distinct from p_claim_token then
    raise exception 'NOTIFICATION_CLAIM_MISMATCH' using errcode = '42501';
  end if;
  if v_row.claim_expires_at is null or v_row.claim_expires_at <= now() then
    raise exception 'NOTIFICATION_CLAIM_EXPIRED' using errcode = '42501';
  end if;

  if p_status = 'sent' then
    -- Aucun « sent » sans 2xx, identifiant prestataire et canal opérationnel.
    if p_provider is null or p_provider_message_id is null
       or p_http_status is null or p_http_status < 200 or p_http_status > 299
       or not public.notification_channel_is_operational(v_row.channel) then
      raise exception 'PROVIDER_CONFIRMATION_REQUIRED' using errcode = '42501';
    end if;
    update public.notification_outbox
    set status = 'sent', sent_at = now(), provider = p_provider,
        provider_message_id = p_provider_message_id, last_error = null,
        claim_token = null, claimed_at = null, claim_expires_at = null, claimed_by = null
    where id = v_row.id;
  elsif p_status = 'failed' then
    -- Échec explicite du prestataire uniquement : nouvelle tentative bornée.
    v_new_status := case when v_row.attempts >= v_row.max_attempts then 'dead' else 'failed' end;
    update public.notification_outbox
    set status = v_new_status,
        next_attempt_at = now() + (v_retry * least(v_row.attempts, 5) || ' minutes')::interval,
        last_error = coalesce(p_error_code, 'DELIVERY_FAILED'),
        provider = p_provider,
        claim_token = null, claimed_at = null, claim_expires_at = null, claimed_by = null
    where id = v_row.id;
    if v_new_status = 'dead' then
      update public.notification_provider_states s
      set server_state = 'en_erreur', last_error = coalesce(p_error_code, 'DELIVERY_FAILED'),
          operational_at = null, updated_at = now()
      where s.channel = v_row.channel;
      perform public.sync_notification_provider_state();
    end if;
  else
    -- Timeout, absence de confirmation ou secret manquant : état ambigu,
    -- blocage terminal pour réconciliation humaine. Aucun réessai automatique.
    update public.notification_outbox
    set status = 'blocked', last_error = coalesce(p_error_code, p_status),
        provider = p_provider, claim_token = null, claimed_at = null,
        claim_expires_at = null, claimed_by = null
    where id = v_row.id;
    if coalesce(p_error_code, '') in (
      'DELIVERY_TIMEOUT_MANUAL_RECONCILIATION',
      'EMAIL_PROVIDER_CONFIRMATION_MISSING',
      'WHATSAPP_PROVIDER_CONFIRMATION_MISSING'
    ) then
      update public.notification_provider_states s
      set server_state = 'en_erreur', last_error = p_error_code,
          operational_at = null, updated_at = now()
      where s.channel = v_row.channel;
      perform public.sync_notification_provider_state();
    end if;
  end if;

  insert into public.notification_attempts
    (notification_id, attempt_no, status, provider, http_status, error_code, provider_message_id)
  values (
    v_row.id, v_row.attempts,
    case when p_status = 'skipped' then 'skipped' else p_status end,
    p_provider, p_http_status, p_error_code, p_provider_message_id
  ) on conflict (notification_id, attempt_no) do nothing;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'notification_result', 'notification', v_row.id::text,
          jsonb_build_object('status', p_status, 'provider', p_provider,
                             'http_status', p_http_status, 'attempt', v_row.attempts,
                             'error_code', p_error_code));
end;
$$;

create or replace function public.reactivate_blocked_notifications(p_channel text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_channel in ('email', 'whatsapp')
     and public.notification_channel_is_operational(p_channel)
     and public.config_bool('notifications_enabled') then
    update public.notification_outbox
    set status = 'pending',
        last_error = null,
        next_attempt_at = now(),
        attempts = 0,
        claim_token = null,
        claimed_at = null,
        claim_expires_at = null,
        claimed_by = null
    where channel = p_channel
      and status = 'blocked'
      and recipient_contact is not null
      and char_length(trim(recipient_contact)) > 0
      and last_error in (
        'NOTIFICATIONS_DISABLED',
        'EMAIL_PROVIDER_NOT_CONFIGURED',
        'WHATSAPP_PROVIDER_NOT_CONFIGURED'
      );
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- Cycle de vie des prestataires : UNIQUEMENT service_role / opérations serveur.
-- Aucun de ces RPC n'accepte ou ne renvoie une valeur de secret.
-- ---------------------------------------------------------------------------

create or replace function public.report_provider_secret_check(
  p_channel text,
  p_secrets_present boolean,
  p_error_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_declared boolean;
  v_current text;
  v_state text;
  v_error text;
begin
  if p_channel not in ('email', 'whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;
  if p_secrets_present is null then
    raise exception 'SECRET_CHECK_REQUIRED' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_]{1,120}$' then
    raise exception 'INVALID_ERROR_CODE' using errcode = '22023';
  end if;
  select declared_active, server_state into v_declared, v_current
  from public.notification_provider_states where channel = p_channel;
  if not found then
    raise exception 'PROVIDER_STATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not p_secrets_present then
    v_state := 'non_configure'; v_error := 'SERVER_SECRETS_MISSING';
  elsif not v_declared then
    v_state := 'non_configure'; v_error := 'PROVIDER_DECLARATION_MISSING';
  elsif p_error_code is not null then
    v_state := 'en_erreur'; v_error := p_error_code;
  elsif v_current in ('teste', 'operationnel') then
    v_state := v_current; v_error := null;
  else
    v_state := 'configure'; v_error := null;
  end if;

  update public.notification_provider_states
  set secrets_present = p_secrets_present,
      last_secret_check_at = now(),
      server_state = v_state,
      last_error = v_error,
      operational_at = case when v_state = 'operationnel' then operational_at else null end,
      last_provider_message_id = case when v_state in ('teste', 'operationnel') then last_provider_message_id else null end,
      last_provider_test_at = case when v_state in ('teste', 'operationnel') then last_provider_test_at else null end,
      updated_at = now()
  where channel = p_channel;
  perform public.sync_notification_provider_state();

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'provider_secret_checked', 'notification_provider_state', p_channel,
          jsonb_build_object('secrets_present', p_secrets_present,
                             'declared_active', v_declared,
                             'server_state', v_state,
                             'error_code', v_error));
end;
$$;

create or replace function public.report_provider_error(
  p_channel text,
  p_error_code text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_channel not in ('email', 'whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;
  if p_error_code is null or p_error_code !~ '^[A-Za-z0-9_]{1,120}$' then
    raise exception 'INVALID_ERROR_CODE' using errcode = '22023';
  end if;
  update public.notification_provider_states
  set server_state = 'en_erreur', last_error = p_error_code,
      operational_at = null, updated_at = now()
  where channel = p_channel;
  perform public.sync_notification_provider_state();
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'provider_error', 'notification_provider_state', p_channel,
          jsonb_build_object('error_code', p_error_code, 'server_state', 'en_erreur'));
end;
$$;

create or replace function public.record_provider_test_result(
  p_channel text,
  p_provider_message_id text,
  p_http_status integer,
  p_error_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_declared boolean;
  v_secrets boolean;
begin
  if p_channel not in ('email', 'whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_]{1,120}$' then
    raise exception 'INVALID_ERROR_CODE' using errcode = '22023';
  end if;
  select declared_active, secrets_present into v_declared, v_secrets
  from public.notification_provider_states where channel = p_channel;
  if not found then
    raise exception 'PROVIDER_STATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_declared or not v_secrets then
    perform public.report_provider_error(p_channel, 'PROVIDER_TEST_REQUIRED');
    return;
  end if;
  if p_error_code is not null
     or p_provider_message_id is null
     or p_provider_message_id !~ '^[A-Za-z0-9._:-]{1,200}$'
     or p_http_status is null or p_http_status < 200 or p_http_status > 299 then
    perform public.report_provider_error(p_channel, 'PROVIDER_TEST_NOT_CONFIRMED');
    return;
  end if;

  update public.notification_provider_states s
  set server_state = 'teste',
      last_provider_message_id = p_provider_message_id,
      last_provider_test_at = now(),
      last_error = null,
      operational_at = null,
      updated_at = now()
  where s.channel = p_channel;
  perform public.sync_notification_provider_state();
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'provider_test_confirmed', 'notification_provider_state', p_channel,
          jsonb_build_object('http_status', p_http_status, 'server_state', 'teste'));
end;
$$;

create or replace function public.mark_provider_operational(
  p_channel text,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_declared boolean;
  v_secrets boolean;
  v_state text;
begin
  if p_channel not in ('email', 'whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select declared_active, secrets_present, server_state
  into v_declared, v_secrets, v_state
  from public.notification_provider_states where channel = p_channel;
  if not found then
    raise exception 'PROVIDER_STATE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_declared or not v_secrets or v_state <> 'teste' then
    raise exception 'PROVIDER_TEST_REQUIRED' using errcode = '42501';
  end if;

  update public.notification_provider_states
  set server_state = 'operationnel', operational_at = now(),
      last_error = null, updated_at = now()
  where channel = p_channel;
  perform public.sync_notification_provider_state();
  perform public.reactivate_blocked_notifications(p_channel);
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'provider_marked_operational', 'notification_provider_state', p_channel,
          jsonb_build_object('server_state', 'operationnel', 'reason_length', char_length(trim(p_reason))));
end;
$$;

-- ---------------------------------------------------------------------------
-- Administration : chaque action est contrôlée, motivée et auditée.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_platform_flag(
  p_key text,
  p_value jsonb,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_bool boolean;
  v_allowed text[] := array['commercial_open','legal_validation_complete','pricing_config_validated'];
begin
  perform public.assert_admin();
  if p_key = 'notifications_enabled' then
    raise exception 'NOTIFICATION_ACTIVATION_SERVER_ONLY' using errcode = '42501';
  end if;
  if p_key is null or not (p_key = any(v_allowed)) then
    raise exception 'UNSUPPORTED_FLAG' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if (p_value #>> '{}') not in ('true','false') then
    raise exception 'INVALID_BOOLEAN_FLAG' using errcode = '22023';
  end if;
  v_bool := (p_value #>> '{}')::boolean;

  if p_key = 'legal_validation_complete' and v_bool and not public.legal_gate_complete() then
    raise exception 'LEGAL_VALIDATIONS_INCOMPLETE' using errcode = '42501';
  end if;
  if p_key = 'commercial_open' and v_bool then
    if not public.config_bool('legal_validation_complete') then
      raise exception 'LEGAL_VALIDATION_REQUIRED' using errcode = '42501';
    end if;
    -- Aucune dépendance à un prestataire payant : les notifications internes
    -- restent disponibles, les canaux externes non opérationnels restent bloqués.
    if not public.config_bool('pricing_config_validated') then
      raise exception 'PRICING_VALIDATION_REQUIRED' using errcode = '42501';
    end if;
    if not exists (select 1 from public.corridors where is_active = true and legal_validation_ref is not null) then
      raise exception 'NO_VALIDATED_ACTIVE_CORRIDOR' using errcode = '42501';
    end if;
    if not public.legal_gate_complete() then
      raise exception 'LEGAL_VALIDATIONS_INCOMPLETE' using errcode = '42501';
    end if;
  end if;

  insert into public.platform_config (key, value, description, updated_by, updated_at)
  values (p_key, p_value, 'Flag opérationnel modifié par un administrateur', auth.uid(), now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  perform public.audit_event('platform_flag_changed', 'platform_config', p_key,
    jsonb_build_object('value', p_value, 'reason_length', char_length(trim(p_reason))));
end;
$$;

create or replace function public.admin_record_legal_validation(
  p_jurisdiction text,
  p_scope text,
  p_professional_name text,
  p_document_ref text,
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.assert_admin();
  if p_jurisdiction not in ('FR','SN','EU','OTHER')
     or p_scope not in ('business_model','transport_rules','customs','airline','insurance','privacy','terms') then
    raise exception 'INVALID_LEGAL_SCOPE' using errcode = '22023';
  end if;
  if p_professional_name is null or char_length(trim(p_professional_name)) < 2 then
    raise exception 'PROFESSIONAL_REQUIRED' using errcode = '22023';
  end if;
  if p_document_ref is null or char_length(trim(p_document_ref)) < 3 then
    raise exception 'DOCUMENT_REFERENCE_REQUIRED' using errcode = '22023';
  end if;
  insert into public.legal_validations
    (jurisdiction, scope, professional_name, document_ref, notes, created_by)
  values (p_jurisdiction, p_scope, trim(p_professional_name), trim(p_document_ref), p_notes, auth.uid())
  returning id into v_id;
  perform public.audit_event('legal_validation_recorded', 'legal_validation', v_id::text,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'scope', p_scope, 'document_ref', p_document_ref));
  return v_id;
end;
$$;

create or replace function public.admin_validate_prohibited_category(
  p_code text,
  p_validation_reference text,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_validation_reference is null or char_length(trim(p_validation_reference)) < 5 then
    raise exception 'VALIDATION_REFERENCE_REQUIRED' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.prohibited_categories
  set is_legally_validated = true,
      validation_reference = trim(p_validation_reference),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where code = p_code;
  if not found then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.audit_event('prohibited_category_validated', 'prohibited_category', p_code,
    jsonb_build_object('reference', p_validation_reference, 'reason', p_reason));
end;
$$;

create or replace function public.admin_set_provider_config(
  p_channel text,
  p_configured boolean,
  p_provider_name text,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_channel not in ('email','whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;
  if p_configured is null or p_provider_name is null
     or char_length(trim(p_provider_name)) not between 2 and 120 then
    raise exception 'PROVIDER_NAME_REQUIRED' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  -- Un secret ne doit jamais être collé dans un champ libre, un audit ou une réponse RPC.
  if p_provider_name ~* '(sb_secret_|sk_live_|service_role|Bearer[[:space:]]+[A-Za-z0-9._-]{20,})'
     or p_reason ~* '(sb_secret_|sk_live_|Bearer[[:space:]]+[A-Za-z0-9._-]{20,})' then
    raise exception 'PROVIDER_SECRET_FORBIDDEN' using errcode = '42501';
  end if;

  update public.notification_provider_states
  set declared_provider_name = trim(p_provider_name),
      declared_active = p_configured,
      declared_by = auth.uid(),
      declared_at = now(),
      updated_at = now()
  where channel = p_channel;
  if not found then
    raise exception 'PROVIDER_STATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Retirer une déclaration désactive le canal ; la déclarer ne l'active JAMAIS.
  if not p_configured then
    update public.notification_provider_states
    set server_state = 'non_configure',
        secrets_present = false,
        last_secret_check_at = now(),
        last_provider_message_id = null,
        last_provider_test_at = null,
        operational_at = null,
        last_error = 'PROVIDER_DECLARATION_WITHDRAWN'
    where channel = p_channel;
    perform public.sync_notification_provider_state();
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'admin', 'notification_provider_declared', 'notification_provider_state', p_channel,
          jsonb_build_object('declared_active', p_configured,
                             'provider', trim(p_provider_name),
                             'reason_length', char_length(trim(p_reason))));
end;
$$;

create or replace function public.admin_review_gp(
  p_user_id uuid,
  p_decision text,
  p_note text default null,
  p_identity_status text default null,
  p_contact_status text default null,
  p_travel_status text default null,
  p_documents_status text default null,
  p_expires_at timestamptz default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  perform public.assert_admin();
  if p_user_id = auth.uid() then
    raise exception 'SELF_APPROVAL_FORBIDDEN' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected','suspended','in_review') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  if p_decision in ('rejected','suspended') and (p_note is null or char_length(trim(p_note)) < 10) then
    raise exception 'DECISION_NOTE_REQUIRED' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'EXPIRY_MUST_BE_FUTURE' using errcode = '22023';
  end if;
  if coalesce(p_identity_status, 'checked') not in ('not_checked','pending','checked','failed')
     or coalesce(p_contact_status, 'checked') not in ('not_checked','pending','checked','failed')
     or coalesce(p_travel_status, 'checked') not in ('not_checked','pending','checked','failed')
     or coalesce(p_documents_status, 'checked') not in ('not_checked','pending','checked','failed') then
    raise exception 'INVALID_CHECK_STATUS' using errcode = '22023';
  end if;
  select g.status into v_old from public.gp_verifications g where g.user_id = p_user_id;
  if not found then
    raise exception 'VERIFICATION_NOT_SUBMITTED' using errcode = 'P0002';
  end if;

  update public.gp_verifications
  set status = p_decision,
      identity_status = coalesce(p_identity_status, identity_status),
      contact_status = coalesce(p_contact_status, contact_status),
      travel_status = coalesce(p_travel_status, travel_status),
      documents_status = coalesce(p_documents_status, documents_status),
      reviewer_id = auth.uid(),
      review_notes = p_note,
      reviewed_at = now(),
      expires_at = p_expires_at
  where user_id = p_user_id;

  update public.profiles
  set gp_approved = (p_decision = 'approved')
  where id = p_user_id;

  if p_decision = 'approved' then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, 'gp', auth.uid())
    on conflict do nothing;
  else
    update public.user_roles
    set revoked_at = now(), revocation_reason = 'Décision de vérification : ' || p_decision
    where user_id = p_user_id and role = 'gp' and revoked_at is null;
  end if;

  update public.verification_documents
  set status = case
      when p_documents_status = 'checked' then 'accepted'
      when p_documents_status = 'failed' then 'rejected'
      else status end,
      reviewed_at = now(), reviewer_id = auth.uid()
  where user_id = p_user_id;

  insert into public.gp_verification_events (user_id, from_status, to_status, actor_id, note)
  values (p_user_id, v_old, p_decision, auth.uid(), p_note);

  perform public.notify_user(
    'gp-verification-decision:' || p_user_id::text || ':' || gen_random_uuid()::text,
    'gp_verification_' || p_decision,
    p_user_id,
    jsonb_build_object('status', p_decision, 'note', coalesce(p_note, '')),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.audit_event('gp_verification_reviewed', 'gp_verification', p_user_id::text,
    jsonb_build_object('from', v_old, 'to', p_decision, 'identity', p_identity_status,
                       'contact', p_contact_status, 'travel', p_travel_status, 'documents', p_documents_status));
end;
$$;

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_user_id = auth.uid() then
    raise exception 'SELF_ACCOUNT_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('active','suspended','closed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if p_status <> 'active' and (p_reason is null or char_length(trim(p_reason)) < 10) then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.profiles
  set status = p_status::public.account_status,
      deactivated_at = case when p_status = 'active' then null else now() end,
      deactivation_reason = case when p_status = 'active' then null else p_reason end
  where id = p_user_id;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.notify_user(
    'account-status:' || p_user_id::text || ':' || gen_random_uuid()::text,
    'account_status_changed',
    p_user_id,
    jsonb_build_object('status', p_status),
    array['in_app','email']::text[]
  );
  perform public.audit_event('account_status_changed', 'profile', p_user_id::text,
    jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.admin_set_corridor_active(
  p_corridor_id uuid,
  p_active boolean,
  p_legal_validation_ref text default null,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_active is null then
    raise exception 'ACTIVE_FLAG_REQUIRED' using errcode = '22023';
  end if;
  if p_active and (p_legal_validation_ref is null or char_length(trim(p_legal_validation_ref)) < 5) then
    raise exception 'LEGAL_REFERENCE_REQUIRED' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.corridors
  set is_active = p_active,
      legal_validation_ref = case when p_active then trim(p_legal_validation_ref) else legal_validation_ref end,
      activated_at = case when p_active then now() else activated_at end,
      activated_by = case when p_active then auth.uid() else activated_by end
  where id = p_corridor_id;
  if not found then
    raise exception 'CORRIDOR_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.audit_event('corridor_activation_changed', 'corridor', p_corridor_id::text,
    jsonb_build_object('active', p_active, 'reference', p_legal_validation_ref, 'reason', p_reason));
end;
$$;

create or replace function public.admin_suspend_trip(p_trip_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_trip public.trips%rowtype;
begin
  perform public.assert_admin();
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select t.* into v_trip from public.trips t where t.id = p_trip_id for update;
  if not found then
    raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_trip.status not in ('draft','published') then
    raise exception 'TRIP_NOT_SUSPENDABLE' using errcode = '22023';
  end if;
  update public.trips
  set status = 'suspended', suspended_at = now(), suspension_reason = p_reason, version = version + 1
  where id = v_trip.id;
  perform public.notify_user(
    'trip-suspended:' || v_trip.id::text,
    'trip_suspended',
    v_trip.gp_id,
    jsonb_build_object('trip_id', v_trip.id::text),
    array['in_app','email']::text[]
  );
  perform public.audit_event('trip_suspended', 'trip', v_trip.id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_grant_role(
  p_user_id uuid,
  p_role text,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_user_id = auth.uid() then
    raise exception 'SELF_ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_role not in ('sender','gp','recipient','admin','gp_applicant') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_role = 'gp' and not exists (
    select 1 from public.gp_verifications v
    where v.user_id = p_user_id and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > now())
  ) then
    raise exception 'GP_APPROVAL_REQUIRED' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  values (p_user_id, p_role, auth.uid())
  on conflict do nothing;
  perform public.audit_event('role_granted', 'user_role', p_user_id::text,
    jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

create or replace function public.admin_revoke_role(
  p_user_id uuid,
  p_role text,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_user_id = auth.uid() then
    raise exception 'SELF_ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.user_roles
  set revoked_at = now(), revocation_reason = p_reason
  where user_id = p_user_id and role = p_role and revoked_at is null;
  perform public.audit_event('role_revoked', 'user_role', p_user_id::text,
    jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

create or replace function public.admin_assign_incident(
  p_incident_id uuid,
  p_assigned_to uuid,
  p_note text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_assigned_to is null or not exists (select 1 from public.profiles p where p.id = p_assigned_to) then
    raise exception 'ASSIGNEE_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.incidents
  set assigned_to = p_assigned_to, status = 'under_review'
  where id = p_incident_id;
  if not found then
    raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_note is not null then
    insert into public.incident_notes (incident_id, author_id, note, is_internal)
    values (p_incident_id, auth.uid(), p_note, true);
  end if;
  perform public.audit_event('incident_assigned', 'incident', p_incident_id::text,
    jsonb_build_object('assigned_to', p_assigned_to::text));
end;
$$;

create or replace function public.admin_add_incident_note(
  p_incident_id uuid,
  p_note text,
  p_is_internal boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.assert_admin();
  if p_note is null or char_length(trim(p_note)) < 1 then
    raise exception 'NOTE_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.incidents i where i.id = p_incident_id) then
    raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.incident_notes (incident_id, author_id, note, is_internal)
  values (p_incident_id, auth.uid(), trim(p_note), coalesce(p_is_internal, true))
  returning id into v_id;
  perform public.audit_event('incident_note_added', 'incident_note', v_id::text);
  return v_id;
end;
$$;

create or replace function public.admin_resolve_incident(
  p_incident_id uuid,
  p_resolution text,
  p_status text default 'resolved'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_incident public.incidents%rowtype;
  v_booking public.bookings%rowtype;
  v_event_type public.passport_event_type;
begin
  perform public.assert_admin();
  if p_status not in ('resolved','closed') then
    raise exception 'INVALID_RESOLUTION_STATUS' using errcode = '22023';
  end if;
  if p_resolution is null or char_length(trim(p_resolution)) < 10 then
    raise exception 'RESOLUTION_REQUIRED' using errcode = '22023';
  end if;
  select i.* into v_incident from public.incidents i where i.id = p_incident_id for update;
  if not found then
    raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.incidents
  set status = p_status, resolution = trim(p_resolution),
      closed_at = case when p_status = 'closed' then now() else closed_at end
  where id = v_incident.id;
  select b.* into v_booking from public.bookings b where b.id = v_incident.booking_id;
  insert into public.incident_notes (incident_id, author_id, note, is_internal)
  values (v_incident.id, auth.uid(), trim(p_resolution), true);
  if found then
    perform public.add_passport_event(
      v_booking.id, null, v_booking.parcel_code, 'incident_resolved'::public.passport_event_type,
      'Incident traité par l administration', null, false, auth.uid(),
      jsonb_build_object('incident_reference', v_incident.internal_reference, 'status', p_status)
    );
    perform public.notify_user(
      'incident-resolved:' || v_incident.id::text || ':sender',
      'incident_resolved',
      v_booking.sender_id,
      jsonb_build_object('reference', v_incident.internal_reference, 'status', p_status),
      array['in_app','email']::text[]
    );
    perform public.notify_user(
      'incident-resolved:' || v_incident.id::text || ':gp',
      'incident_resolved',
      v_booking.gp_id,
      jsonb_build_object('reference', v_incident.internal_reference, 'status', p_status),
      array['in_app']::text[]
    );
  end if;
  perform public.audit_event('incident_resolved', 'incident', v_incident.id::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_handover_fallback(
  p_booking_id uuid,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings%rowtype;
begin
  perform public.assert_admin();
  if p_reason is null or char_length(trim(p_reason)) < 15 then
    raise exception 'DETAILED_REASON_REQUIRED' using errcode = '22023';
  end if;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.status not in ('ready_for_pickup','disputed') then
    raise exception 'BOOKING_NOT_ELIGIBLE_FOR_FALLBACK' using errcode = '22023';
  end if;
  update public.delivery_codes
  set revoked_at = now()
  where booking_id = v_booking.id and used_at is null and revoked_at is null;
  update public.bookings
  set status = 'delivered', delivered_at = now()
  where id = v_booking.id;
  update public.parcel_requests set status = 'delivered' where id = v_booking.parcel_request_id;
  perform public.add_passport_event(
    v_booking.id, null, v_booking.parcel_code, 'admin_handover'::public.passport_event_type,
    'Remise validée par procédure de secours administrateur', null, true, auth.uid(),
    jsonb_build_object('status', 'delivered', 'procedure', 'admin_fallback')
  );
  perform public.notify_user(
    'admin-handover:' || v_booking.id::text || ':sender',
    'admin_handover',
    v_booking.sender_id,
    jsonb_build_object('parcel_code', v_booking.parcel_code, 'status', 'delivered'),
    array['in_app','email','whatsapp']::text[]
  );
  perform public.audit_event('admin_handover_fallback', 'booking', v_booking.id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'counts', jsonb_build_object(
      'profiles', (select count(*) from public.profiles),
      'pending_gp', (select count(*) from public.gp_verifications where status in ('pending','in_review')),
      'trips', (select count(*) from public.trips),
      'requests', (select count(*) from public.parcel_requests),
      'bookings', (select count(*) from public.bookings),
      'open_incidents', (select count(*) from public.incidents where status in ('open','under_review')),
      'blocked_notifications', (select count(*) from public.notification_outbox where status = 'blocked')
    ),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, display_name, phone, status, gp_approved, profile_completed_at, created_at
        from public.profiles order by created_at desc limit 100
      ) x), '[]'::jsonb),
    'gp_verifications', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select user_id, status, identity_status, contact_status, travel_status, documents_status,
               travel_departure_at, travel_destination, submitted_at, reviewed_at, expires_at
        from public.gp_verifications order by submitted_at desc nulls last limit 100
      ) x), '[]'::jsonb),
    'verification_documents', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, user_id, kind, storage_path, status, uploaded_at
        from public.verification_documents order by uploaded_at desc limit 100
      ) x), '[]'::jsonb),
    'corridors', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, origin_label, destination_label, is_active, legal_validation_ref, activated_at
        from public.corridors order by origin_label
      ) x), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, gp_id, origin_city, destination_city, departure_at,
               capacity_total_kg, capacity_remaining_kg, price_per_kg, currency, status, created_at
        from public.trips order by created_at desc limit 100
      ) x), '[]'::jsonb),
    'parcel_requests', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, parcel_code, sender_id, trip_id, status, weight_kg, declared_content, created_at
        from public.parcel_requests order by created_at desc limit 100
      ) x), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, parcel_code, sender_id, gp_id, trip_id, status, weight_kg,
               agreed_price, currency, confirmed_at, delivered_at, created_at
        from public.bookings order by created_at desc limit 100
      ) x), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, internal_reference, booking_id, category, status, priority, assigned_to, created_at
        from public.incidents order by created_at desc limit 100
      ) x), '[]'::jsonb),
    'audit_logs', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at
        from public.audit_logs order by created_at desc limit 100
      ) x), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, event_type, channel, status, attempts, last_error, provider, created_at, sent_at
        from public.notification_outbox order by created_at desc limit 100
      ) x), '[]'::jsonb),
    'legal_validations', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select jurisdiction, scope, professional_name, document_ref, validated_at
        from public.legal_validations order by validated_at desc
      ) x), '[]'::jsonb),
    'platform_config', coalesce((
      select jsonb_object_agg(key, value) from public.platform_config
      where key in ('commercial_open','legal_validation_complete','notifications_enabled',
                    'email_provider_configured','whatsapp_provider_configured',
                    'email_provider_state','whatsapp_provider_state','pricing_config_validated')
    ), '{}'::jsonb),
    'notification_provider_states', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select channel, declared_provider_name, declared_active, server_state,
               secrets_present, last_secret_check_at, last_provider_test_at,
               operational_at, last_error, updated_at
        from public.notification_provider_states order by channel
      ) x), '[]'::jsonb),
    'prohibited_categories', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select code, label, restriction, is_legally_validated, validation_reference
        from public.prohibited_categories order by code
      ) x), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Buckets privés et politiques Storage
-- ---------------------------------------------------------------------------

do $do$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets (id, name, "public")
      values ('gp-documents', 'gp-documents', false),
             ('incident-evidence', 'incident-evidence', false)
      on conflict (id) do nothing
    $sql$;
  end if;

  if to_regclass('storage.objects') is not null then
    execute $sql$ alter table storage.objects enable row level security $sql$;
    execute $sql$ drop policy if exists gp_documents_select on storage.objects $sql$;
    execute $sql$ drop policy if exists gp_documents_insert on storage.objects $sql$;
    execute $sql$ drop policy if exists incident_evidence_select on storage.objects $sql$;
    execute $sql$ drop policy if exists incident_evidence_insert on storage.objects $sql$;
    execute $sql$
      create policy gp_documents_select on storage.objects for select to authenticated
      using (bucket_id = 'gp-documents'
             and (split_part(name, '/', 1) = auth.uid()::text or public.current_user_is_admin()))
    $sql$;
    execute $sql$
      create policy gp_documents_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'gp-documents' and split_part(name, '/', 1) = auth.uid()::text)
    $sql$;
    execute $sql$
      create policy incident_evidence_select on storage.objects for select to authenticated
      using (bucket_id = 'incident-evidence' and public.current_user_is_admin())
    $sql$;
    execute $sql$
      create policy incident_evidence_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'incident-evidence' and public.current_user_is_admin())
    $sql$;
    execute $sql$ grant select, insert on storage.objects to authenticated $sql$;
  end if;
end $do$;

-- ---------------------------------------------------------------------------
-- Moindres privilèges : aucune écriture directe depuis le navigateur
-- ---------------------------------------------------------------------------

revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
-- Les fonctions PostgreSQL ont EXECUTE accordé à PUBLIC par défaut : il faut
-- impérativement révoquer ce privilège implicite avant d'accorder les RPC sûres.
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.available_trips to anon, authenticated;
grant select on public.prohibited_categories to anon, authenticated;
-- platform_config et notification_provider_states ne sont jamais exposés directement.
grant select (id, origin_country_code, destination_country_code, origin_label,
              destination_label, is_active, rules_url, legal_validation_ref)
  on public.corridors to anon, authenticated;

grant select on public.my_notifications, public.delivery_code_status to authenticated;
grant select on public.profiles, public.user_roles, public.gp_verifications,
  public.gp_verification_events, public.verification_documents, public.trip_alerts,
  public.parcel_requests, public.bookings, public.passport_events, public.incidents,
  public.incident_notes, public.incident_evidence, public.legal_validations,
  public.booking_event_rules, public.audit_logs, public.prohibited_categories
  to authenticated;
grant select (id, gp_id, corridor_id, origin_city, destination_city, departure_at, arrival_at,
              capacity_total_kg, capacity_remaining_kg, currency, price_per_kg, conditions,
              status, created_at, updated_at, published_at, cancelled_at, suspended_at,
              version, last_capacity_change_at)
  on public.trips to authenticated;

grant execute on function public.search_trips(text, text, date, numeric) to anon, authenticated;
grant execute on function public.get_parcel_passport(text) to anon, authenticated;
grant execute on function public.current_user_is_admin() to anon, authenticated;
grant execute on function public.get_my_state() to authenticated;
grant execute on function public.list_trip_corridors() to authenticated;
grant execute on function public.update_my_profile(text, text, text, boolean, boolean) to authenticated;
grant execute on function public.request_role(text) to authenticated;
grant execute on function public.create_trip_draft(uuid, text, text, timestamptz, numeric, text, numeric, text) to authenticated;
grant execute on function public.publish_my_trip(uuid) to authenticated;
grant execute on function public.update_my_trip(uuid, jsonb) to authenticated;
grant execute on function public.cancel_my_trip(uuid, text) to authenticated;
grant execute on function public.submit_gp_verification(text, text, text, timestamptz, text, numeric, text, text, text, text, text, text, bigint, text, bigint, boolean) to authenticated;
grant execute on function public.submit_parcel_request(uuid, text, text, numeric, text, text, text, boolean, boolean, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.respond_to_request(uuid, boolean, text) to authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.advance_booking(uuid, public.passport_event_type, text) to authenticated;
grant execute on function public.report_passport_event(uuid, public.passport_event_type, text) to authenticated;
grant execute on function public.issue_delivery_code(uuid) to authenticated;
grant execute on function public.verify_delivery_code(text, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.report_incident(uuid, text, text) to authenticated;
grant execute on function public.create_trip_alert(text, text, text, boolean, date) to authenticated;
grant execute on function public.admin_set_platform_flag(text, jsonb, text) to authenticated;
grant execute on function public.admin_record_legal_validation(text, text, text, text, text) to authenticated;
grant execute on function public.admin_validate_prohibited_category(text, text, text) to authenticated;
grant execute on function public.admin_set_provider_config(text, boolean, text, text) to authenticated;
grant execute on function public.admin_review_gp(uuid, text, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_corridor_active(uuid, boolean, text, text) to authenticated;
grant execute on function public.admin_suspend_trip(uuid, text) to authenticated;
grant execute on function public.admin_grant_role(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_role(uuid, text, text) to authenticated;
grant execute on function public.admin_assign_incident(uuid, uuid, text) to authenticated;
grant execute on function public.admin_add_incident_note(uuid, text, boolean) to authenticated;
grant execute on function public.admin_resolve_incident(uuid, text, text) to authenticated;
grant execute on function public.admin_handover_fallback(uuid, text) to authenticated;
grant execute on function public.admin_overview() to authenticated;

do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute $sql$ grant execute on function public.bootstrap_first_admin(uuid) to service_role $sql$;
    execute $sql$ grant execute on function public.claim_notifications(integer, text) to service_role $sql$;
    execute $sql$ grant execute on function public.record_notification_result(uuid, uuid, text, text, text, integer, text) to service_role $sql$;
    execute $sql$ grant execute on function public.report_provider_secret_check(text, boolean, text) to service_role $sql$;
    execute $sql$ grant execute on function public.report_provider_error(text, text) to service_role $sql$;
    execute $sql$ grant execute on function public.record_provider_test_result(text, text, integer, text) to service_role $sql$;
    execute $sql$ grant execute on function public.mark_provider_operational(text, text) to service_role $sql$;
  end if;
end $do$;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;

-- Le rôle exécutant la migration peut différer sur Supabase : verrouiller aussi
-- les privilèges par défaut du rôle courant, pas seulement ceux de postgres.
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke all on functions from public, anon, authenticated;

commit;
