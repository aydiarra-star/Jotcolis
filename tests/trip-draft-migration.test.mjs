import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/202610290002_secure_trip_drafts_and_publication.sql", import.meta.url),
  "utf8"
);

test("GP approval is off by default and cannot be granted through the public profile fields", () => {
  assert.match(migration, /add column if not exists gp_approved boolean not null default false/i);
  assert.match(migration, /grant execute on function public\.publish_my_trip\(uuid\) to authenticated/i);
  assert.match(migration, /GP_APPROVAL_REQUIRED/);
});

test("trip drafts require an authenticated active account and validate future dates and capacity", () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /ACCOUNT_NOT_ACTIVE/);
  assert.match(migration, /DEPARTURE_MUST_BE_FUTURE/);
  assert.match(migration, /INVALID_CAPACITY/);
  assert.match(migration, /conditions, status[\s\S]*'draft'/);
});

test("publication requires an approved GP and active corridor and locks the owned draft", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /p\.gp_approved = true/);
  assert.match(migration, /c\.is_active = true/);
  assert.match(migration, /CORRIDOR_INACTIVE/);
  assert.match(migration, /t\.gp_id = v_user_id/);
});

test("RPC functions do not expose internal corridor validation notes", () => {
  assert.match(migration, /returns table \([\s\S]*origin_label text[\s\S]*is_active boolean/);
  assert.doesNotMatch(migration, /validation_notes text/);
  assert.match(migration, /revoke all on function public\.create_trip_draft/);
});


test("public table grants use least privilege and keep GP approval operator-controlled", async () => {
  const grants = await readFile(
    new URL("../supabase/migrations/202610290004_harden_public_table_grants.sql", import.meta.url),
    "utf8"
  );
  assert.match(grants, /revoke all privileges on all tables in schema public from anon, authenticated/i);
  assert.match(grants, /grant select on table public\.corridors, public\.trips to anon/i);
  assert.match(grants, /grant update \(display_name, phone, country_code\)[\s\S]*to authenticated/i);
  assert.match(grants, /revoke all on functions from anon, authenticated/i);
  assert.doesNotMatch(grants, /grant (?:insert|update|delete|truncate) on table public\.trips to (?:anon|authenticated)/i);
});

test("passport event reports derive identity and timestamp from the server", async () => {
  const passport = await readFile(
    new URL("../supabase/migrations/202610290005_secure_passport_event_reporting.sql", import.meta.url),
    "utf8"
  );
  assert.match(passport, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(passport, /p_event_type,[\s\S]*now\(\),[\s\S]*v_user_id,[\s\S]*'user'/i);
  assert.doesNotMatch(passport, /p_actor_id|p_occurred_at|p_source/i);
});

test("only approved active GPs can report milestones on their own bookings", async () => {
  const passport = await readFile(
    new URL("../supabase/migrations/202610290005_secure_passport_event_reporting.sql", import.meta.url),
    "utf8"
  );
  assert.match(passport, /p\.status = 'active'[\s\S]*p\.gp_approved = true/i);
  assert.match(passport, /b\.gp_id = v_user_id[\s\S]*for update/i);
  assert.match(passport, /OWN_BOOKING_NOT_FOUND/);
});

test("user reports are limited to non-final milestones and valid booking states", async () => {
  const passport = await readFile(
    new URL("../supabase/migrations/202610290005_secure_passport_event_reporting.sql", import.meta.url),
    "utf8"
  );
  assert.match(passport, /EVENT_TYPE_NOT_USER_REPORTABLE/);
  assert.match(passport, /BOOKING_NOT_CONFIRMED/);
  assert.match(passport, /BOOKING_NOT_IN_TRANSIT/);
  assert.match(passport, /visible_to_sender,[\s\S]*visible_to_gp,[\s\S]*visible_to_recipient[\s\S]*true,[\s\S]*true,[\s\S]*false/i);
  assert.doesNotMatch(passport, /update public\.bookings/i);
  assert.match(passport, /revoke all on function public\.report_passport_event\(uuid, public\.passport_event_type, text\) from public, anon/i);
  assert.match(passport, /grant execute on function public\.report_passport_event\(uuid, public\.passport_event_type, text\) to authenticated/i);
});
