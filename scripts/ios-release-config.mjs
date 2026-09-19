/**
 * Shared configuration and App Store Connect client for the local iOS release path.
 *
 * Everything secret lives in ../secrets, next to the Play service account and the Android
 * keystore, and never in the repo. Values are read, never printed.
 *
 * ../secrets/ios-release.env holds three non-secret identifiers:
 *   SUKUN_TEAM_ID        Apple Developer team id, e.g. ABCDE12345
 *   SUKUN_ASC_KEY_ID     App Store Connect API key id
 *   SUKUN_ASC_ISSUER_ID  App Store Connect issuer id (one per team)
 *
 * and the key itself is ../secrets/AuthKey_<SUKUN_ASC_KEY_ID>.p8, the filename Apple's own
 * tools expect. The distribution certificate lives in the login keychain and the App Store
 * provisioning profile is ../secrets/sukun-appstore.mobileprovision.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SECRETS = path.resolve(ROOT, '../secrets');
export const ENV_FILE = path.join(SECRETS, 'ios-release.env');
export const PROFILE = path.join(SECRETS, 'sukun-appstore.mobileprovision');
export const BUNDLE_ID = 'co.sukunwellness';
export const ASC_APP_ID = '6804203454';
export const ARCHIVE = path.join(ROOT, 'build/ios/Sukun.xcarchive');
export const IPA = path.join(ROOT, 'build/ios/Sukun.ipa');

const KEYS = ['SUKUN_TEAM_ID', 'SUKUN_ASC_KEY_ID', 'SUKUN_ASC_ISSUER_ID'];

/** Reads ../secrets/ios-release.env, with the process environment taking precedence. */
export function loadConfig({ required = true } = {}) {
  const fromFile = {};
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at === -1) continue;
      fromFile[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '');
    }
  }

  const config = {};
  const missing = [];
  for (const key of KEYS) {
    const value = process.env[key] ?? fromFile[key];
    if (!value || value.startsWith('PUT_')) missing.push(key);
    config[key] = value;
  }

  config.keyFile = config.SUKUN_ASC_KEY_ID
    ? path.join(SECRETS, `AuthKey_${config.SUKUN_ASC_KEY_ID}.p8`)
    : null;

  if (required && missing.length > 0) {
    console.error('\niOS release is not configured. Missing or still a placeholder:\n');
    for (const key of missing) console.error(`  ${key}`);
    console.error(`\nSet these in ${ENV_FILE} (never in the repo), then retry.\n`);
    process.exit(1);
  }
  config.missing = missing;
  return config;
}

/**
 * A short lived App Store Connect token. ES256 over the .p8, so no npm dependency: the JWT
 * needs the raw r||s signature rather than Node's default DER, hence ieee-p1363.
 */
export function ascToken(config) {
  const key = fs.readFileSync(config.keyFile, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: config.SUKUN_ASC_KEY_ID, typ: 'JWT' })}.${b64({
    iss: config.SUKUN_ASC_ISSUER_ID,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1',
  })}`;
  const signature = crypto
    .sign('SHA256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${unsigned}.${signature}`;
}

export async function asc(config, endpoint) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
    headers: { Authorization: `Bearer ${ascToken(config)}` },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`GET ${endpoint} -> ${res.status}: ${body?.errors?.[0]?.detail ?? text}`);
  }
  return body;
}

/**
 * The highest build number App Store Connect has for this app, across every version and
 * whatever state it is in. This is the number both release paths have to stay ahead of:
 * App Store Connect, not EAS and not app.json, is what actually refuses a duplicate.
 */
export async function latestBuildNumber(config) {
  const body = await asc(
    config,
    `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-version&limit=200&fields[builds]=version`,
  );
  const numbers = body.data
    .map((build) => Number.parseInt(build.attributes?.version ?? '', 10))
    .filter((n) => Number.isFinite(n));
  return numbers.length > 0 ? Math.max(...numbers) : 0;
}
