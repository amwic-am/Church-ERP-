// Shared Postgres harness: a real PGlite database with Supabase's auth/storage
// schemas stubbed, so migrations and domain functions can actually be executed
// locally (no Docker, no Supabase project) before anything is deployed.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../supabase/migrations');

export async function migrationFiles() {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
}

export async function openDb() {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(await readFile(path.resolve(import.meta.dirname, 'supabase-stubs.sql'), 'utf8'));
  return db;
}

// Applies migrations in order. `upTo` (inclusive filename) stops early.
export async function applyMigrations(db, upTo) {
  for (const file of await migrationFiles()) {
    await db.exec(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
    if (upTo && file === upTo) break;
  }
}

// Runs `fn` as a Postgres role with the Supabase JWT subject set, which is what
// auth.uid() and the row level security policies read. The claim is cleared
// afterwards, so a later owner-level statement never inherits a signed-in user.
export async function as(db, role, userId, fn) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

export function check(name, ok, detail = '') {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

// node-postgres/PGlite speak $1, $2 placeholders; scripts here are written with
// `?` for readability, so translate before sending and keep failures readable.
export async function query(db, sql, params = []) {
  let n = 0;
  try {
    return await db.query(sql.replace(/\?/g, () => `$${(n += 1)}`), params);
  } catch (err) {
    const clean = new Error(String(err.message ?? err).split('\n')[0]);
    clean.code = err.code;
    clean.where = err.where;
    if (Number.isFinite(Number(err.position))) {
      clean.message += ` (near ${sql.slice(0, Number(err.position)).split('\n').pop()?.trim()}…)`;
    }
    throw clean;
  }
}

export async function rows(db, sql, params) {
  return (await query(db, sql, params)).rows;
}

