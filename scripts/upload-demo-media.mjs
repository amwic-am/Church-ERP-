// Uploads the bundled demo photographs into the linked Supabase `media` bucket.
//
// The seeded `media_files` rows in supabase/seed/04_site_content.sql advertise
// public Storage URLs under `demo/`, so the site renders broken images until the
// objects exist at exactly those paths. Sources are the freely-licensed Wikimedia
// files already served from /public/images (see public/images/CREDITS.md).
//
// Idempotent: an object that already exists at the target path is left alone, so a
// real admin upload to the same path is never silently overwritten.
//
// Secrets: the service-role key is read from `supabase/.temp/service_role.txt`
// (gitignored, produced by `supabase projects api-keys`) and is never printed.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUCKET = 'media';

// target path in the bucket -> the local photo that belongs there
const UPLOADS = [
  ['demo/church-exterior.jpg', 'public/images/church-exterior.jpg'],
  ['demo/worship-liturgy.jpg', 'public/images/hero-procession.jpg'],
  ['demo/sunday-school-class.jpg', 'public/images/lalibela-interior.jpg'],
  ['demo/choir-rehearsal.jpg', 'public/images/community-outreach.jpg'],
  ['demo/kebero-drums.jpg', 'public/images/deacons.jpg'],
  ['demo/feast-procession.jpg', 'public/images/feast-timket.jpg'],
  ['demo/baptism-ceremony.jpg', 'public/images/feast-timket.jpg'],
  ['demo/community-outreach.jpg', 'public/images/community-outreach.jpg'],
  ['demo/youth-fellowship.jpg', 'public/images/deacons.jpg'],
  ['demo/church-library.jpg', 'public/images/geez-manuscript.jpg'],
  ['demo/teacher-graduation.jpg', 'public/images/aksum-bible.jpg'],
  ['demo/church-mural.jpg', 'public/images/worship-art.jpg'],
  ['branding/eotc_logo.png', 'public/eotc_logo.png'],
];

async function projectUrl() {
  const env = await readFile(path.join(ROOT, '.env'), 'utf8');
  const hit = /^VITE_SUPABASE_URL=(.*)$/m.exec(env);
  if (!hit) throw new Error('.env has no VITE_SUPABASE_URL');
  return hit[1].trim();
}

async function serviceKey() {
  const file = path.join(ROOT, 'supabase/.temp/service_role.txt');
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch {
    throw new Error(`missing ${path.relative(ROOT, file)} — run \`supabase projects api-keys -o json\` first`);
  }
}

const url = await projectUrl();
const key = await serviceKey();
const headers = { Apikey: key, Authorization: `Bearer ${key}` };

let uploaded = 0;
let existing = 0;

for (const [to, from] of UPLOADS) {
  const head = await fetch(`${url}/storage/v1/object/info/public/${BUCKET}/${to}`, { headers });
  if (head.ok) {
    existing++;
    continue;
  }
  const body = await readFile(path.join(ROOT, from));
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${to}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/' + (from.endsWith('.png') ? 'png' : 'jpeg'), 'x-upsert': 'false' },
    body,
  });
  if (!response.ok) {
    console.error(`${to} failed — HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
    process.exitCode = 1;
    break;
  }
  uploaded++;
  console.log(`  ${to.padEnd(38)} ${from.padEnd(40)} ${(await stat(path.join(ROOT, from))).size}b`);
}

console.log(`uploaded ${uploaded}, already present ${existing} of ${UPLOADS.length}`);
