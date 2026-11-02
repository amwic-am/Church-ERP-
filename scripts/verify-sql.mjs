// Runs every supabase/migrations/*.sql against a real Postgres (PGlite/WASM) with
// Supabase's auth/storage schemas stubbed, so SQL errors surface here rather than
// in the project. Not a test of app behaviour — see smoke-db.mjs for that.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MIGRATIONS_DIR, migrationFiles, openDb } from './pg.mjs';

async function main() {
  const db = await openDb();
  const files = await migrationFiles();
  let failed = 0;

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`ok   ${file}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${file}`);
      console.error(`     ${String(err.message ?? err).split('\n').slice(0, 6).join('\n     ')}`);
      const at = Number(err.position);
      if (Number.isFinite(at)) {
        const line = sql.slice(0, at).split('\n').length;
        console.error(`     near line ${line}: ${sql.split('\n')[line - 1]?.trim().slice(0, 120)}`);
      }
      if (err.where) console.error(`     ${String(err.where).split('\n').slice(0, 3).join(' / ')}`);
    }
  }

  const tables = await db.query(
    "select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v')"
  );
  const policies = await db.query("select count(*)::int as n from pg_policies where schemaname = 'public'");
  console.log(`\nrelations/views: ${tables.rows[0].n} · rls policies: ${policies.rows[0].n}`);
  await db.close();

  if (failed > 0) {
    console.error(`\n${failed} migration file(s) failed.`);
    process.exit(1);
  }
  console.log('\nall migrations applied.');
}

main();
