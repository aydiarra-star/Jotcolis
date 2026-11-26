import test, { describe, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  MIGRATIONS_DIR,
  createTestDatabase,
  createDatabaseWithMigrationFiles,
  applyMigrationFile,
  createUser,
  asService,
  asUser,
  callSetRpcNamed,
  expectError,
} from "./helpers/pglite-db.mjs";

const openDatabases = [];
const serial = { concurrency: false };

async function newDatabase(files) {
  const db = files ? await createDatabaseWithMigrationFiles(files) : await createTestDatabase();
  openDatabases.push(db);
  return db;
}

async function migrationFiles() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  return {
    all: files,
    historical: files.filter((name) => !name.startsWith("20261126")),
    final: files.filter((name) => name.startsWith("20261126")),
  };
}

async function publicTableNames(db) {
  const result = await db.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return result.rows.map((row) => row.tablename);
}

async function publicFunctionNames(db) {
  const result = await db.query(`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname
  `);
  return result.rows.map((row) => row.proname);
}

after(async () => {
  for (const db of openDatabases) await db.close();
});

describe("Audit final — compatibilité historique, réexécution et moindres privilèges", serial, () => {
  test("les quatre migrations finales se réexécutent et préservent une donnée existante", serial, async () => {
    const { final } = await migrationFiles();
    const db = await newDatabase();
    const markerKey = "phase_finale_replay_marker";
    const userId = randomUUID();
    await createUser(db, {
      id: userId,
      email: "replay@example.test",
      confirmed: true,
      displayName: "Réexécution Test",
    });
    await asService(db, () => db.query(
      "insert into public.platform_config (key, value, description) values ($1, '\"conservé\"'::jsonb, 'Marqueur local de non-destruction') on conflict (key) do nothing",
      [markerKey],
    ));
    const beforeProfiles = (await asService(db, () => db.query("select count(*)::int as n from public.profiles"))).rows[0].n;

    for (const file of final) await applyMigrationFile(db, file);

    const marker = (await asService(db, () => db.query(
      "select value #>> '{}' as value from public.platform_config where key = $1",
      [markerKey],
    ))).rows[0];
    assert.equal(marker.value, "conservé");
    const afterProfiles = (await asService(db, () => db.query("select count(*)::int as n from public.profiles"))).rows[0].n;
    assert.equal(afterProfiles, beforeProfiles);
    const states = (await asService(db, () => db.query("select count(*)::int as n from public.notification_provider_states"))).rows[0].n;
    assert.equal(states, 2);
    const policies = (await asService(db, () => db.query(
      "select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'platform_config'",
    ))).rows[0].n;
    assert.equal(policies, 0);
  });

  test("le schéma historique reste présent et les anciennes RPC restent autorisées", serial, async () => {
    const { historical, final } = await migrationFiles();
    const db = await newDatabase(historical);
    const beforeTables = await publicTableNames(db);
    const beforeFunctions = await publicFunctionNames(db);
    assert.ok(beforeTables.length > 0);
    assert.ok(beforeFunctions.length > 0);

    for (const file of final) await applyMigrationFile(db, file);

    const afterTables = await publicTableNames(db);
    const afterFunctions = await publicFunctionNames(db);
    for (const table of beforeTables) assert.ok(afterTables.includes(table), `Table historique disparue : ${table}`);
    for (const fn of beforeFunctions) assert.ok(afterFunctions.includes(fn), `Fonction historique disparue : ${fn}`);

    const requiredColumns = [
      ["profiles", "profile_completed_at"], ["trips", "published_at"],
      ["parcel_requests", "parcel_code"], ["bookings", "parcel_code"],
      ["passport_events", "parcel_code"], ["passport_events", "event_hash"],
      ["notification_outbox", "claim_expires_at"], ["notification_outbox", "claimed_by"],
      ["notification_provider_states", "server_state"],
    ];
    for (const [table, column] of requiredColumns) {
      const result = await asService(db, () => db.query(`
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2
      `, [table, column]));
      assert.equal(result.rows.length, 1, `Colonne attendue absente : ${table}.${column}`);
    }

    for (const fn of ["list_trip_corridors", "create_trip_draft", "publish_my_trip", "report_passport_event"]) {
      const result = await asService(db, () => db.query(`
        select has_function_privilege('authenticated', p.oid, 'EXECUTE') as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1
      `, [fn]));
      assert.ok(result.rows.some((row) => row.ok), `EXECUTE authenticated manquant sur ${fn}`);
    }

    const trips = await asUser(db, null, () => callSetRpcNamed(db, "search_trips", {
      p_origin: null, p_destination: null, p_date: null, p_min_capacity: null,
    }), "anon");
    assert.ok(Array.isArray(trips));
    const passport = await asUser(db, null, () => callSetRpcNamed(db, "get_parcel_passport", {
      p_parcel_code: "JC-PHASE-FINALE-ABSENT",
    }), "anon");
    assert.equal(passport.length, 0);
  });

  test("grants, RLS, SECURITY DEFINER, search_path et isolement des tables sensibles", serial, async () => {
    const db = await newDatabase();
    const publicExecute = (await asService(db, () => db.query(`
      select count(*)::int as n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('public', p.oid, 'EXECUTE')
    `))).rows[0].n;
    assert.equal(publicExecute, 0);

    const missingSearchPath = (await asService(db, () => db.query(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and (p.proconfig is null or not p.proconfig::text like '%search_path=%')
    `))).rows.map((row) => row.proname);
    assert.deepEqual(missingSearchPath, []);

    const rlsDisabled = (await asService(db, () => db.query(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `))).rows.map((row) => row.relname);
    assert.deepEqual(rlsDisabled, []);

    const platformSource = await readFile(new URL("../platform.js", import.meta.url), "utf8");
    const selectedTables = [...new Set([...platformSource.matchAll(/select\("([a-z_]+)"/g)].map((m) => m[1]))];
    assert.ok(selectedTables.length >= 8);
    for (const table of selectedTables) {
      const result = await asService(db, () => db.query(
        "select (has_table_privilege('authenticated', $1, 'SELECT') or has_any_column_privilege('authenticated', $1, 'SELECT')) as ok",
        [`public.${table}`],
      ));
      assert.equal(result.rows[0].ok, true, `SELECT authenticated manquant sur ${table}`);
    }

    for (const table of ["platform_config", "notification_provider_states"]) {
      await expectError(
        asUser(db, null, () => db.query(`select * from public.${table}`), "anon"),
        "permission denied",
      );
      await expectError(
        asUser(db, randomUUID(), () => db.query(`select * from public.${table}`)),
        "permission denied",
      );
    }

    const internal = ["bootstrap_first_admin", "claim_notifications", "record_notification_result",
      "report_provider_secret_check", "report_provider_error",
      "record_provider_test_result", "mark_provider_operational"];
    for (const fn of internal) {
      const result = await asService(db, () => db.query(`
        select has_function_privilege('service_role', p.oid, 'EXECUTE') as ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1
      `, [fn]));
      assert.ok(result.rows.some((row) => row.ok), `EXECUTE service_role manquant sur ${fn}`);
    }
  });

  test("les migrations finales sont additives, sans suppression de données ni policy non idempotente", serial, async () => {
    const { final } = await migrationFiles();
    const sources = await Promise.all(final.map((file) => readFile(new URL(file, MIGRATIONS_DIR), "utf8")));
    sources.forEach((source, index) => {
      const file = final[index];
      assert.doesNotMatch(source, /\bdrop\s+table\b|\bdrop\s+column\b|\bdrop\s+schema\b|\btruncate\b|\bdelete\s+from\b/i, `${file} contient une destruction de données`);
      assert.doesNotMatch(source, /grant\s+select\s+on\s+public\.platform_config/i);
      assert.doesNotMatch(source, /create\s+policy\s+platform_config_select_all/i);
      for (const match of source.matchAll(/create\s+policy\s+(\w+)/g)) {
        const name = match[1];
        assert.match(source, new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${name}\\b`, "i"), `${file}: policy ${name} sans DROP IF EXISTS`);
      }
    });
  });
});
