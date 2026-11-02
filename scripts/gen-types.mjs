// Builds src/types/database.ts from the migrations themselves: apply every
// migration in PGlite, read information_schema, and emit the types. Nothing here
// is hand-written twice, so the frontend cannot drift from the database.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { openDb, applyMigrations, rows } from './pg.mjs';

const OUT = path.resolve(import.meta.dirname, '../src/types/database.ts');

const TS_BY_TYPE = {
  text: 'string',
  'character varying': 'string',
  uuid: 'string',
  boolean: 'boolean',
  integer: 'number',
  bigint: 'number',
  smallint: 'number',
  numeric: 'string | number',
  'timestamp with time zone': 'string',
  'timestamp without time zone': 'string',
  date: 'string',
  time: 'string',
  jsonb: 'Json',
  json: 'Json',
  'character(1)': 'string',
  bytea: 'string',
};

// Element types for the array columns this schema actually uses.
const ARRAY_TS = { text: 'string', varchar: 'string', uuid: 'string', int4: 'number', jsonb: 'Json', json: 'Json' };

function toPascal(s) {
  return s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

const db = await openDb();
await applyMigrations(db);

const enums = await rows(
  db,
  `select t.typname as name,
          string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
     from pg_type t
     join pg_namespace n on n.oid = t.typnamespace
     join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
    group by t.typname`
);

const tables = await rows(
  db,
  `select c.table_name, c.column_name, c.data_type, c.is_nullable,
          coalesce(e.typname, nullif(c.udt_name, '')) as udt,
          (c.data_type = 'ARRAY') as is_array,
          nullif(a.attgenerated, '') as generated
     from information_schema.columns c
     join information_schema.tables t
       on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     join pg_class pc on pc.relname = c.table_name and pc.relkind = 'r'
     join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
     join pg_attribute a on a.attrelid = pc.oid and a.attname = c.column_name and a.attnum > 0
     left join pg_type e on e.oid = a.atttypid and e.typtype = 'e'
    where c.table_schema = 'public'
    order by c.table_name, c.ordinal_position`
);

const views = await rows(
  db,
  `select c.table_name, c.column_name, c.data_type, c.is_nullable,
          coalesce(e.typname, nullif(c.udt_name, '')) as udt,
          (c.data_type = 'ARRAY') as is_array,
          nullif(a.attgenerated, '') as generated
     from information_schema.columns c
     join information_schema.views v on v.table_schema = c.table_schema and v.table_name = c.table_name
     join pg_class pc on pc.relname = c.table_name and pc.relkind = 'v'
     join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
     join pg_attribute a on a.attrelid = pc.oid and a.attname = c.column_name and a.attnum > 0
     left join pg_type e on e.oid = a.atttypid and e.typtype = 'e'
    where c.table_schema = 'public'
    order by c.table_name, c.ordinal_position`
);

const keys = await rows(
  db,
  `select tc.constraint_type as kind,
          tc.table_name as table_name,
          tc.constraint_name as constraint_name,
          array_agg(kcu.column_name order by kcu.ordinal_position) as columns,
          array_agg(ccu.table_name order by kcu.ordinal_position) as ref_tables,
          array_agg(ccu.column_name order by kcu.ordinal_position) as ref_columns
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY', 'FOREIGN KEY')
    group by tc.constraint_type, tc.table_name, tc.constraint_name
    order by tc.table_name, tc.constraint_name`
);

// Supabase's query builder only types a relation that declares its foreign keys:
// without `Relationships` every `from()` falls back to `never` and the rows lose
// their column names. So the real constraints, not an empty array, go in.
const pkByTable = new Map();
const fkByTable = new Map();
for (const k of keys) {
  if (k.kind === 'PRIMARY KEY') {
    if (!pkByTable.has(k.table_name)) pkByTable.set(k.table_name, k);
    continue;
  }
  if (!fkByTable.has(k.table_name)) fkByTable.set(k.table_name, []);
  fkByTable.get(k.table_name).push(k);
}

function relationshipsFor(t) {
  const list = fkByTable.get(t) ?? [];
  if (list.length === 0) return '[]';
  return `[${list
    .map(
      (f) =>
        `{ foreignKeyName: ${JSON.stringify(f.constraint_name)}, columns: ${JSON.stringify(f.columns)}, isOneToOne: false, referencedRelation: ${JSON.stringify(f.ref_tables[0])}, referencedColumns: ${JSON.stringify(f.ref_columns)} }`
    )
    .join(', ')}]`;
}

function primaryKeyFor(t) {
  const pk = pkByTable.get(t);
  return JSON.stringify(pk ? pk.columns[0] : 'id');
}

const enumNames = new Set(enums.map((e) => e.name));

function tsType(col) {
  const isArray = col.is_array === true || col.is_array === 'true';
  // Array columns report udt_name as "_text", "_uuid", "_jsonb" …
  const element = (isArray ? String(col.udt || '').replace(/^_/, '') : col.udt) || '';
  if (enumNames.has(element)) return isArray ? `${toPascal(element)}[]` : toPascal(element);
  if (isArray) return `${ARRAY_TS[element] ?? 'string'}[]`;
  if (col.data_type === 'USER-DEFINED') return 'string';
  return TS_BY_TYPE[col.data_type] ?? 'string';
}

function interfaceBody(columns) {
  return columns
    .map((c) => {
      const optional = c.is_nullable === 'YES' ? '?' : '';
      return `  ${c.column_name}${optional}: ${tsType(c)};`;
    })
    .join('\n');
}

const byTable = new Map();
for (const c of [...tables, ...views]) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
  byTable.get(c.table_name).push(c);
}

const tableNames = [...new Set(tables.map((t) => t.table_name))].sort();
const viewNames = [...new Set(views.map((v) => v.table_name))].sort();

const out = [];
// Row shapes are `type` aliases, never `interface`s: only an object *type* gets an
// implicit index signature, and without one Supabase's `Record<string, unknown>`
// constraint rejects every table and `from()` collapses to `never`.
out.push(`// Generated by scripts/gen-types.mjs from supabase/migrations. Do not edit by hand.`);
out.push(`/* eslint-disable */`);
out.push('');
out.push('export type Json = string | number | boolean | null | { [k: string]: Json | Json[] } | Json[];');
out.push('');out.push('// ─── enums ───');
for (const e of enums) {
  const name = toPascal(e.name);
  out.push(`export type ${name} = ${e.labels.split(',').map((l) => `'${l}'`).join(' | ')};`);
}
out.push('');
out.push('// ─── tables ───');
for (const t of tableNames) {
  const cols = byTable.get(t);
  out.push(`export type ${toPascal(t)}Row = {`);
  out.push(interfaceBody(cols));
  out.push('}');
  out.push('');
  // Insert omits generated/defaults the database fills in; keep it simple and
  // honest: nullable columns and generated columns are optional.
  const insertCols = cols.filter((c) => c.is_nullable === 'YES' || c.generated);
  const required = cols.filter((c) => c.is_nullable === 'NO' && !c.generated);
  out.push(`export type ${toPascal(t)}Insert = {`);
  out.push(interfaceBody(required));
  out.push(interfaceBody(insertCols.map((c) => ({ ...c, is_nullable: 'YES' }))));
  out.push('}');
  out.push('');
  out.push(`export type ${toPascal(t)}Update = Partial<${toPascal(t)}Insert>;`);
  out.push('');
}
out.push('// ─── public read views ───');
for (const v of viewNames) {
  out.push(`export type ${toPascal(v)} = {`);
  out.push(interfaceBody(byTable.get(v)));
  out.push('}');
  out.push('');
}

out.push('export type TableName =');
out.push(tableNames.map((t) => `  | '${t}'`).join('\n'));
out.push(';');
out.push('');
out.push('export type ViewName =');
out.push(viewNames.map((v) => `  | '${v}'`).join('\n'));
out.push(';');
out.push('');

// ─── the Supabase-shaped Database type, so from(...)/rpc(...) are typed ──────
// proargnames alone mixes IN and OUT/TABLE parameters, which turns a
// `returns table(...)` column into a phantom rpc argument. Split them by mode.
const fns = await rows(
  db,
  `select p.proname as name,
          coalesce(p.proargnames, '{}'::text[]) as argnames,
          coalesce(p.proallargtypes::regtype[]::text[], p.proargtypes::regtype[]::text[], '{}'::text[]) as alltypes,
          coalesce(p.proargmodes::text[], '{}'::text[]) as modes,
          coalesce(p.pronargdefaults, 0) as ndefaults,
          p.proretset as set_returning,
          format_type(p.prorettype, null) as ret,
          t.typname as ret_typname,
          t.typtype as ret_typtype
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.prorettype::regtype::text <> 'trigger'
    order by p.proname, p.proargtypes`
);

const SCALAR_TS = {
  uuid: 'string',
  text: 'string',
  'character varying': 'string',
  name: 'string',
  boolean: 'boolean',
  integer: 'number',
  bigint: 'number',
  smallint: 'number',
  numeric: 'string | number',
  'double precision': 'number',
  real: 'number',
  date: 'string',
  'timestamp with time zone': 'string',
  'timestamp without time zone': 'string',
  time: 'string',
  'time without time zone': 'string',
  jsonb: 'Json',
  json: 'Json',
  void: 'null',
  trigger: 'never',
};

function simpleType(regtype) {
  const t = String(regtype).replace(/\[\]$/, '');
  const isArray = String(regtype).endsWith('[]');
  const bare = t.replace(/^public\./, '');
  let base;
  if (enumNames.has(bare)) base = toPascal(bare);
  else if (tableNames.includes(bare)) base = `${toPascal(bare)}Row`;
  else base = SCALAR_TS[bare] ?? 'unknown';
  return isArray ? `${base}[]` : base;
}

const seen = new Set();
const fnBlocks = [];
for (const f of fns) {
  if (seen.has(f.name)) continue; // one overload per name, like the Supabase client
  seen.add(f.name);
  const modes = f.modes.length ? f.modes : f.argnames.map(() => 'i');
  const inIdx = [];
  const outIdx = [];
  modes.forEach((m, i) => {
    if (m === 'o' || m === 't') outIdx.push(i);
    else inIdx.push(i);
  });
  const optional = Number(f.ndefaults ?? 0);
  const args = inIdx
    .map((i, k) => {
      const n = f.argnames[i] ?? `p${k + 1}`;
      return `${n}${k >= inIdx.length - optional ? '?' : ''}: ${simpleType(f.alltypes[i])}`;
    })
    .join('; ');
  let ret;
  if (outIdx.length) {
    const cols = outIdx.map((i) => `${f.argnames[i]}: ${simpleType(f.alltypes[i])}`).join('; ');
    ret = `{ ${cols} }${f.set_returning ? '[]' : ''}`;
  } else if (f.ret_typtype === 'c' || f.ret_typtype === 'e') {
    ret = `${simpleType(f.ret_typname)}${f.set_returning ? '[]' : ''}`;
  } else {
    ret = simpleType(f.ret);
  }
  fnBlocks.push(
    `    ${f.name}: {\n      Args: { ${args} };\n      Returns: ${ret};\n      Setof: ${f.set_returning ? 'true' : 'false'};
    };`
  );
}

out.push('// A type alias, not an interface: only an object type gets the implicit index signature');
out.push('// the Supabase client needs to accept arbitrary relation names.');
out.push('export type Database = {');
out.push('  public: {');
out.push('    Tables: {');
for (const t of tableNames) {
  out.push(
    `      ${t}: { Row: ${toPascal(t)}Row; Insert: ${toPascal(t)}Insert; Update: ${toPascal(t)}Update; Relationships: ${relationshipsFor(t)}; PrimaryKeyName: ${primaryKeyFor(t)} };`
  );
}
out.push('    };');
out.push('    Views: {');
for (const v of viewNames) {
  out.push(`      ${v}: { Row: ${toPascal(v)}; Relationships: [] };`);
}
out.push('    };');
out.push('    Functions: {');
out.push(fnBlocks.join('\n'));
out.push('    };');
out.push('    Enums: {');
for (const e of enums) out.push(`      ${e.name}: ${toPascal(e.name)};`);
out.push('    };');
out.push('  };');
out.push('};');
out.push('');

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, out.join('\n'), 'utf8');

// ─── permission keys and seeded role grants, straight from the database ──────
// The UI guard list and the database must agree exactly, so neither is typed by
// hand: these constants are re-derived every time the migrations change.
const perms = await rows(
  db,
  `select p.key, p.name_am, r.key as role_key
     from public.permissions p
     left join public.role_permissions rp on rp.permission_key = p.key
     left join public.roles r on r.id = rp.role_id
    order by p.key, r.key`
);
const roles = await rows(db, `select key, name_am from public.roles order by key`);

const labels = new Map();
const byRole = new Map();
for (const row of perms) {
  labels.set(row.key, row.name_am);
  if (!row.role_key) continue;
  if (!byRole.has(row.role_key)) byRole.set(row.role_key, []);
  byRole.get(row.role_key).push(row.key);
}

const permOut = [];
permOut.push('// Generated by scripts/gen-types.mjs from the migrations — do not edit by hand.');
permOut.push('// Regenerate with `npm run db:types`.');
permOut.push('');
permOut.push('export const PERMISSION_LABELS = {');
for (const [key, label] of labels) permOut.push(`  ${JSON.stringify(key)}: ${JSON.stringify(label)},`);
permOut.push('} as const;');
permOut.push('');
permOut.push('export type PermissionKey = keyof typeof PERMISSION_LABELS;');
permOut.push('');
permOut.push(`export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];`);
permOut.push('');
permOut.push('export const ROLE_LABELS = {');
for (const r of roles) permOut.push(`  ${JSON.stringify(r.key)}: ${JSON.stringify(r.name_am)},`);
permOut.push('} as const;');
permOut.push('');
permOut.push('export type RoleKey = keyof typeof ROLE_LABELS;');
permOut.push('');
permOut.push(`export const ROLE_KEYS = ${JSON.stringify(roles.map((r) => r.key))} as const satisfies readonly RoleKey[];`);
permOut.push('');
permOut.push('/** The grants seeded by the migrations; live grants come from the database. */');
permOut.push('export const SEED_ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {');
for (const r of roles) {
  const list = (byRole.get(r.key) ?? []).map((k) => JSON.stringify(k));
  permOut.push(`  ${JSON.stringify(r.key)}: [${list.join(', ')}],`);
}
permOut.push('};');
permOut.push('');

const PERM_OUT = path.resolve(import.meta.dirname, '../src/types/permissions.ts');
await writeFile(PERM_OUT, permOut.join('\n'), 'utf8');

console.log(
  `wrote ${path.relative(process.cwd(), OUT)} — ${tableNames.length} tables, ${viewNames.length} views, ` +
    `${enums.length} enums, ${fnBlocks.length} functions`
);
console.log(
  `wrote ${path.relative(process.cwd(), PERM_OUT)} — ${labels.size} permissions, ${roles.length} roles`
);
await db.close();
