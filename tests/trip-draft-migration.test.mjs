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
  assert.match(migration, /status\) values[\s\S]*'draft'/);
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
