import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);

export const SHIMS = `
do $shim$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then execute 'create role anon nologin'; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'create role authenticated nologin'; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then execute 'create role service_role nologin'; end if;
end $shim$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists storage;
grant usage on schema storage to authenticated;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  "public" boolean not null default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner uuid
);
`;

export async function applyMigrationFile(db, file) {
  let sql = await readFile(new URL(file, MIGRATIONS_DIR), "utf8");
  // PGlite n'embarque pas pgcrypto ; le code applicatif utilise uniquement
  // les fonctions built-in pg_catalog (gen_random_uuid, sha256).
  sql = sql.replace(/create extension if not exists pgcrypto;/gi, "");
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`Migration ${file} a échoué: ${error.message}`, { cause: error });
  }
}

export async function createDatabaseWithMigrationFiles(files) {
  const db = new PGlite();
  await db.exec(SHIMS);
  for (const file of files) await applyMigrationFile(db, file);
  return db;
}

export async function createTestDatabase() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return createDatabaseWithMigrationFiles(files);
}

export async function createUser(db, { id, email, confirmed = true, displayName = "Test" }) {
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, $3, $4)
     on conflict (id) do update set email = excluded.email,
       email_confirmed_at = excluded.email_confirmed_at`,
    [id, email, confirmed ? new Date().toISOString() : null, JSON.stringify({ display_name: displayName })]
  );
}

export async function asUser(db, userId, callback, role = "authenticated") {
  await db.exec(`set role ${role};`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ""]);
  try {
    return await callback();
  } finally {
    await db.exec("reset role;");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

export async function asService(db, callback) {
  await db.exec("reset role;");
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  return callback();
}

export async function callRpc(db, name, values = []) {
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `select public.${name}(${placeholders}) as result`;
  const { rows } = await db.query(sql, values);
  return rows[0]?.result;
}

export async function callRpcNamed(db, name, args = {}) {
  const keys = Object.keys(args);
  const values = Object.values(args);
  const parts = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
  const sql = `select public.${name}(${parts}) as result`;
  const { rows } = await db.query(sql, values);
  return rows[0]?.result;
}

export async function callSetRpcNamed(db, name, args = {}) {
  const keys = Object.keys(args);
  const values = Object.values(args);
  const parts = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
  const sql = `select * from public.${name}(${parts})`;
  const { rows } = await db.query(sql, values);
  return rows;
}

export async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes(code)) {
      throw new Error(`Erreur attendue ${code}, obtenue: ${message}`);
    }
    return message;
  }
  throw new Error(`Une erreur ${code} était attendue, aucune levée`);
}
