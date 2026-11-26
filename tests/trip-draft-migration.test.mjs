import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rpcs = await readFile(new URL("../supabase/migrations/202611260003_platform_rpcs.sql", import.meta.url), "utf8");
const tables = await readFile(new URL("../supabase/migrations/202611260002_platform_tables.sql", import.meta.url), "utf8");
const security = await readFile(new URL("../supabase/migrations/202611260004_platform_admin_security.sql", import.meta.url), "utf8");
const oldPassport = await readFile(new URL("../supabase/migrations/202610290005_secure_passport_event_reporting.sql", import.meta.url), "utf8");

test("la publication impose compte actif, e-mail confirmé, profil complet, GP approuvé, liaison validée et porte juridique", () => {
  assert.match(rpcs, /create or replace function public\.publish_my_trip/);
  assert.match(rpcs, /perform public\.assert_active_account\(true, true\)/);
  assert.match(rpcs, /perform public\.assert_commercial_open\(\)/);
  assert.match(rpcs, /GP_APPROVAL_REQUIRED/);
  assert.match(rpcs, /CORRIDOR_NOT_VALIDATED/);
  assert.match(rpcs, /for update/);
  assert.match(rpcs, /status = 'published', published_at = now\(\)/);
});

test("la porte juridique exige les validations FR/SN et toutes les catégories documentées", () => {
  assert.match(rpcs, /create or replace function public\.legal_gate_complete/);
  assert.match(rpcs, /\('FR','business_model'\), \('SN','business_model'\)/);
  assert.match(rpcs, /\('FR','customs'\), \('SN','customs'\)/);
  assert.match(rpcs, /\('FR','airline'\), \('SN','airline'\)/);
  assert.match(rpcs, /bool_and\(pc\.is_legally_validated\)/);
  assert.match(security, /admin_set_platform_flag/);
  assert.match(security, /LEGAL_VALIDATIONS_INCOMPLETE/);
});

test("la capacité est réservée par verrou serveur et refusée sans dépassement", () => {
  assert.match(rpcs, /select r\.\* into v_req from public\.parcel_requests r\s+where r\.id = p_request_id for update/s);
  assert.match(rpcs, /select t\.\* into v_trip from public\.trips t\s+where t\.id = v_req\.trip_id for update/s);
  assert.match(rpcs, /capacity_remaining_kg >= v_req\.weight_kg/);
  assert.match(rpcs, /CAPACITY_EXHAUSTED/);
  assert.match(rpcs, /update public\.trips\s+set capacity_remaining_kg = capacity_remaining_kg - v_req\.weight_kg/s);
  assert.match(rpcs, /create or replace function public\.cancel_booking/);
  assert.match(rpcs, /capacity_released_at is null/);
});

test("le passeport n'accepte que des transitions déclarées côté serveur", () => {
  assert.match(tables, /create table if not exists public\.booking_event_rules/);
  assert.match(rpcs, /select r\.\* into v_rule from public\.booking_event_rules r/);
  assert.match(rpcs, /INVALID_BOOKING_TRANSITION/);
  assert.match(rpcs, /return public\.advance_booking\(p_booking_id, p_event_type, p_note\);/);
  assert.match(oldPassport, /report_passport_event/);
  assert.doesNotMatch(rpcs, /create or replace function public\.report_passport_event[\s\S]{0,400}update public\.passport_events/s);
});

test("les codes de remise sont imprévisibles, hachés, à usage unique et vérifiés côté serveur", () => {
  assert.match(rpcs, /generate_delivery_code/);
  assert.match(rpcs, /gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text/);
  assert.match(rpcs, /public\.hash_secret\(v_salt, public\.normalize_code\(v_code\)\)/);
  assert.match(rpcs, /DELIVERY_CODE_ALREADY_ISSUED/);
  assert.match(rpcs, /DELIVERY_CODE_LOCKED/);
  assert.match(security, /create or replace function public\.admin_handover_fallback/);
  assert.match(security, /'admin_handover'::public\.passport_event_type/);
});

test("aucune écriture directe sensible n'est accordée au navigateur", () => {
  assert.doesNotMatch(security, /grant (?:insert|update|delete|truncate) on (?:table )?public\.(?:bookings|passport_events|audit_logs|delivery_codes|user_roles)/i);
  assert.doesNotMatch(security, /grant execute on function public\.bootstrap_first_admin\(uuid\) to authenticated/i);
  assert.doesNotMatch(security, /grant execute on function public\.claim_notifications\(integer, text\) to authenticated/i);
  assert.match(security, /grant execute on function public\.search_trips\(text, text, date, numeric\) to anon, authenticated/);
  assert.match(security, /grant execute on function public\.submit_parcel_request\(/);
});
