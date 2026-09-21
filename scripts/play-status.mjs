/**
 * Read-only: what Play holds, and what the store is actually serving.
 *
 * The Play Developer API has no "in review" state, so this reports the two facts that
 * bracket it: the versionCode sitting on a track (submitted), and the "Updated on" date
 * the public listing shows (published). When the date moves past the submission, the
 * review is through.
 *
 *   node scripts/play-status.mjs
 *   node scripts/play-status.mjs --since 2026-09-15   # exit 0 if live, 1 if still pending
 *
 * Opens an edit to read the tracks and deletes it again. Nothing is ever committed, so this
 * cannot change the store.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = path.resolve(ROOT, '../secrets/sukun-play-service-account.json');
const PACKAGE = 'co.sukunwellness';
const BASE = 'https://androidpublisher.googleapis.com';
const LISTING = `https://play.google.com/store/apps/details?id=${PACKAGE}&hl=en&gl=EG`;

const args = process.argv.slice(2);
const at = args.indexOf('--since');
const since = at === -1 ? undefined : args[at + 1];

if (!fs.existsSync(KEY_FILE)) {
  console.error(`No service account key at ${KEY_FILE}`);
  process.exit(2);
}

const sa = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/androidpublisher',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
})}`;
const assertion = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')}`;
const auth = await (
  await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
).json();
if (!auth.access_token) {
  console.error(`auth failed: ${auth.error_description ?? auth.error}`);
  process.exit(2);
}

const call = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${auth.access_token}`, ...init.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url.replace(BASE, '')} -> ${res.status}: ${body?.error?.message ?? text}`);
  return body;
};

const edits = `${BASE}/androidpublisher/v3/applications/${PACKAGE}/edits`;
const edit = await call(edits, { method: 'POST' });
let tracks;
try {
  tracks = await call(`${edits}/${edit.id}/tracks`);
} finally {
  await call(`${edits}/${edit.id}`, { method: 'DELETE' }).catch(() => {});
}

console.log('submitted to Play');
for (const t of tracks.tracks ?? []) {
  for (const r of t.releases ?? []) {
    const codes = (r.versionCodes ?? []).join(', ');
    console.log(`  ${t.track.padEnd(10)} versionCode ${codes}  "${r.name ?? ''}"  status ${r.status}`);
  }
}
if (!(tracks.tracks ?? []).some((t) => (t.releases ?? []).length)) console.log('  (no releases on any track)');

// The public listing is the only place a completed review shows up.
const listing = await fetch(LISTING, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
});
if (!listing.ok) {
  console.error(`\nlisting -> ${listing.status}: the store page is not public`);
  process.exit(2);
}
const html = await listing.text();

const updated = html.replace(/<[^>]+>/g, ' ').match(/Updated on\s+([A-Z][a-z]{2} \d{1,2}, \d{4})/);
const liveDate = updated?.[1];
console.log('\nlive on the store');
console.log(`  updated on ${liveDate ?? 'unknown'}`);
console.log(`  ${LISTING}`);

if (since) {
  const cutoff = new Date(`${since}T00:00:00Z`).getTime();
  const live = liveDate ? new Date(`${liveDate} UTC`).getTime() : NaN;
  if (Number.isNaN(live)) {
    console.log('\nUNKNOWN: could not read the listing date');
    process.exit(2);
  }
  if (live > cutoff) {
    console.log(`\nLIVE: the store moved to ${liveDate}, past ${since}. The update is published.`);
    process.exit(0);
  }
  console.log(`\nPENDING: the store is still on ${liveDate}. Not published yet.`);
  process.exit(1);
}
