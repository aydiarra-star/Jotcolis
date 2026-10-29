import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/202610280001_initial_schema_draft.sql", import.meta.url),
  "utf8"
);

test("draft migration enables RLS on every business table", () => {
  for (const table of [
    "profiles",
    "corridors",
    "trips",
    "parcel_requests",
    "bookings",
    "passport_events",
    "incidents",
    "audit_logs"
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security;`),
      `RLS should be enabled for ${table}`
    );
  }
});

test("booking and parcel passport mutations are not directly granted to clients", () => {
  assert.match(
    migration,
    /revoke insert, update, delete on public\.bookings from anon, authenticated;/
  );
  assert.match(
    migration,
    /revoke insert, update, delete on public\.passport_events from anon, authenticated;/
  );
  assert.match(
    migration,
    /No direct trip update\/delete until safe server-side lifecycle functions exist\./
  );
});

test("public corridor grants exclude internal validation notes", () => {
  assert.match(migration, /revoke all on public\.corridors from anon, authenticated;/);
  assert.match(
    migration,
    /grant select \(id, origin_country_code, destination_country_code, origin_label,\s*destination_label, is_active, rules_url\) on public\.corridors to anon, authenticated;/
  );
  assert.doesNotMatch(
    migration,
    /grant select on public\.corridors to anon, authenticated;/
  );
});

test("auth trigger helper is not directly executable by application roles", () => {
  assert.match(
    migration,
    /revoke all on function public\.handle_new_user\(\) from public, anon, authenticated;/
  );
});

test("draft does not include a Supabase service-role secret", () => {
  assert.doesNotMatch(migration, /service_role_key|SUPABASE_SERVICE_ROLE_KEY/i);
});
