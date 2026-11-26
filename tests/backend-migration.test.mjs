import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
const migrations = new Map(await Promise.all(files.map(async (file) => [
  file,
  await readFile(new URL(file, dir), "utf8"),
])));
const allSql = [...migrations.values()].join("\n");
const finalSecurity = migrations.get("202611260004_platform_admin_security.sql");

test("toutes les migrations historiques restent présentes et les nouvelles sont additives", () => {
  assert.equal(files.length, 10);
  for (const name of [
    "202610280001_initial_schema_draft.sql",
    "202610290001_seed_international_corridors.sql",
    "202610290002_secure_trip_drafts_and_publication.sql",
    "202610290003_restrict_trip_rpc_grants.sql",
    "202610290004_harden_public_table_grants.sql",
    "202610290005_secure_passport_event_reporting.sql",
    "202611260001_platform_status_enums.sql",
    "202611260002_platform_tables.sql",
    "202611260003_platform_rpcs.sql",
    "202611260004_platform_admin_security.sql",
  ]) {
    assert.ok(files.includes(name), `Migration manquante : ${name}`);
  }
  assert.doesNotMatch(migrations.get("202611260002_platform_tables.sql"), /drop table|truncate table|delete from public\./i);
});

test("le schéma final active RLS et révoque les privilèges PUBLIC implicites", () => {
  assert.match(finalSecurity, /revoke all privileges on all tables in schema public from public, anon, authenticated/);
  assert.match(finalSecurity, /revoke all on all functions in schema public from public, anon, authenticated/);
  assert.match(allSql, /alter table public\.audit_logs enable row level security/);
  assert.match(allSql, /alter table public\.delivery_codes enable row level security/);
  assert.match(allSql, /alter table public\.notification_outbox enable row level security/);
  assert.match(allSql, /alter default privileges for role postgres in schema public\s+revoke all on functions from public, anon, authenticated/);
});

test("les colonnes sensibles des corridors ne sont pas accordées au public", () => {
  assert.match(finalSecurity, /grant select \(id, origin_country_code, destination_country_code, origin_label,\s*destination_label, is_active, rules_url, legal_validation_ref\)/);
  assert.doesNotMatch(finalSecurity, /grant select on public\.corridors to anon, authenticated/);
  assert.doesNotMatch(finalSecurity, /validation_notes\) on public\.corridors/);
});

test("les buckets privés, l'audit immuable et la chaîne du passeport sont déclarés", () => {
  assert.match(allSql, /values \('gp-documents', 'gp-documents', false\)/);
  assert.match(allSql, /\('incident-evidence', 'incident-evidence', false\)/);
  assert.match(allSql, /create policy gp_documents_select on storage\.objects/);
  assert.match(allSql, /create trigger audit_logs_immutable before update or delete/);
  assert.match(allSql, /create trigger passport_events_immutable before update or delete/);
  assert.match(allSql, /create trigger passport_events_hash_chain before insert/);
  assert.match(allSql, /pg_catalog\.sha256/);
});

test("aucun secret de service n'est écrit dans le dépôt", () => {
  assert.match(allSql, /bootstrap_first_admin/);
  assert.match(finalSecurity, /grant execute on function public\.bootstrap_first_admin\(uuid\) to service_role/);
  assert.doesNotMatch(allSql, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['\"]|sb_secret_|sk_live_/i);
});
