/**
 * Uploads a built .aab to Google Play and assigns it to a track.
 *
 * Deliberately dependency free: Node can sign the JWT and speak HTTP, so the release path
 * carries no npm supply chain and no Ruby toolchain. The service account key is read from
 * disk and never printed.
 *
 * Usage:
 *   node scripts/play-publish.mjs --track internal
 *   node scripts/play-publish.mjs --track production --status completed
 *
 * --status draft      uploaded, not released, finish the rollout in the console (default)
 *          completed  released to 100% of the track immediately
 *
 * Play rejects a bundle whose versionCode is not higher than every versionCode the app has
 * already received, and rejects one signed with the wrong upload key. Both are hard refusals
 * that change nothing on the store, so a mistake here costs a retry, not a bad release.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = path.resolve(ROOT, '../secrets/sukun-play-service-account.json');
const AAB = path.join(ROOT, 'android/app/build/outputs/bundle/release/app-release.aab');
const PACKAGE = 'co.sukunwellness';
const BASE = 'https://androidpublisher.googleapis.com';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const track = arg('track', 'internal');
const status = arg('status', 'draft');

if (!['draft', 'completed', 'halted', 'inProgress'].includes(status)) {
  console.error(`Unknown --status "${status}"`);
  process.exit(1);
}
for (const [label, file] of [['service account key', KEY_FILE], ['bundle', AAB]]) {
  if (!fs.existsSync(file)) {
    console.error(`No ${label} at ${file}`);
    process.exit(1);
  }
}

const sa = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const assertion = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`auth failed: ${body.error_description ?? body.error}`);
  return body.access_token;
}

const token = await accessToken();
const call = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url.replace(BASE, '')} -> ${res.status}: ${body?.error?.message ?? text}`);
  return body;
};

const edits = `${BASE}/androidpublisher/v3/applications/${PACKAGE}/edits`;
const edit = await call(edits, { method: 'POST' });
console.log(`edit ${edit.id} opened`);

try {
  const bytes = fs.readFileSync(AAB);
  console.log(`uploading ${(bytes.length / 1024 / 1024).toFixed(1)} MB ...`);
  const uploaded = await call(
    `${BASE}/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${edit.id}/bundles?uploadType=media`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes },
  );
  console.log(`uploaded versionCode ${uploaded.versionCode}`);

  await call(`${edits}/${edit.id}/tracks/${track}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track, releases: [{ status, versionCodes: [String(uploaded.versionCode)] }] }),
  });
  console.log(`assigned to "${track}" with status "${status}"`);

  await call(`${edits}/${edit.id}:commit`, { method: 'POST' });
  console.log(`committed. versionCode ${uploaded.versionCode} is now on "${track}".`);
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  await call(`${edits}/${edit.id}`, { method: 'DELETE' }).catch(() => {});
  console.error('edit abandoned, nothing was changed on the store.');
  process.exit(1);
}
