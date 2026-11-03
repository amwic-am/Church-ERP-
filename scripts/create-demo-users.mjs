// Creates the demo sign-in accounts in the linked Supabase project.
//
// GoTrue owns `auth.users` (identities, one-time tokens, the trigger that writes
// `public.profiles`), so the accounts are created through its admin API rather
// than by inserting rows. Everything else in the demo — role grants, scopes, the
// student/teacher/member records — is linked afterwards by email, which is why the
// local part of each address is the role it demonstrates.
//
// Secrets: the service-role key is read from `supabase/.temp/service_role.txt`
// (gitignored, produced by `supabase projects api-keys`) and is never printed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEMP = path.join(ROOT, 'supabase/.temp');

// One password for every demo account, documented in the seed README.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Teckle#2026';

const ACCOUNTS = [
  { local: 'superadmin', role: 'super_admin', nameAm: 'ዋና አስተዳዳሪ ኃ/ገ/ሚኪኤል' },
  { local: 'registrar', role: 'registrar', nameAm: 'መዝጋቢ — ሐዋርያት ዮሐንስ' },
  { local: 'finance', role: 'finance_officer', nameAm: 'ፋይናንስ ኃላፊ — ለገሠ እስክንድር' },
  { local: 'approver', role: 'finance_approver', nameAm: 'ፋይናንስ አጻዳቂ — ገ/ሚካኤል ብርሃኔ' },
  { local: 'editor', role: 'website_editor', nameAm: 'የድረ ገጽ አዘጋጅ — ዳግም ገ/እግዚአብሔር' },
  { local: 'approver-content', role: 'content_approver', nameAm: 'ይዘት ሸምጋኚ — አባ ገ/ስላሴ' },
  { local: 'media', role: 'media_minister', nameAm: 'የሚዲያ ኃላፊ — ሰላምነሽ ወ/ሮ ካሳ' },
  { local: 'teacher', role: 'teacher', nameAm: 'መምህር — መልካሙ ተስፋዬ' },
  { local: 'dept', role: 'department_head', nameAm: 'የክፍል ኃላፊ — ጸጋዬ አበበ' },
  { local: 'student', role: 'student', nameAm: 'ተማሪ — ናትናኤል መሐመድ' },
  { local: 'parent', role: 'parent', nameAm: 'ወላጅ — ወ/ሮ ሰላም ተስፋዬ' },
  { local: 'member', role: 'member', nameAm: 'አባል — ብርሃኔ ገብረ ማርያም' },
];

async function projectUrl() {
  const env = await readFile(path.join(ROOT, '.env'), 'utf8');
  const hit = /^VITE_SUPABASE_URL=(.*)$/m.exec(env);
  if (!hit) throw new Error('.env has no VITE_SUPABASE_URL');
  return hit[1].trim();
}

async function serviceKey() {
  const file = path.join(TEMP, 'service_role.txt');
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch {
    throw new Error(`missing ${path.relative(ROOT, file)} — run \`supabase projects api-keys -o json\` first`);
  }
}

const url = await projectUrl();
const key = await serviceKey();
const created = [];
const skipped = [];

for (const account of ACCOUNTS) {
  const email = `${account.local}@tekleteoflos.demo`;
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      data: { full_name_am: account.nameAm, demo_role: account.role },
    }),
  });
  const text = await response.text();
  if (response.ok) {
    const user = JSON.parse(text);
    created.push({ email, id: user.id, role: account.role });
    continue;
  }
  if (response.status === 422 || /already/i.test(text)) {
    skipped.push({ email, role: account.role });
    continue;
  }
  console.error(`${email} failed — HTTP ${response.status} ${text.slice(0, 200)}`);
  process.exitCode = 1;
  break;
}

await mkdir(TEMP, { recursive: true });
await writeFile(path.join(TEMP, 'demo-accounts.json'), JSON.stringify({ password: DEMO_PASSWORD, created, skipped }, null, 2));

console.log(`created ${created.length}, already present ${skipped.length}`);
for (const row of created) console.log(`  ${row.email.padEnd(34)} ${row.role.padEnd(20)} ${row.id}`);
for (const row of skipped) console.log(`  ${row.email.padEnd(34)} ${row.role} (existing)`);
