/**
 * Fails the release build unless real signing credentials are present.
 *
 * withAndroidSigning.js falls back to the debug keystore when the SUKUN_* properties are
 * missing, because that block is evaluated for every Gradle task and throwing there would
 * break debug builds. That fallback is what this guards: without it, a missing property
 * produces a debug-signed .aab that looks fine until Play rejects it.
 *
 * Values are never printed. Only which keys are missing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEYS = ['SUKUN_STORE_FILE', 'SUKUN_STORE_PASSWORD', 'SUKUN_KEY_ALIAS', 'SUKUN_KEY_PASSWORD'];
const GRADLE_PROPERTIES = path.join(os.homedir(), '.gradle', 'gradle.properties');

const fromFile = {};
if (fs.existsSync(GRADLE_PROPERTIES)) {
  for (const line of fs.readFileSync(GRADLE_PROPERTIES, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at === -1) continue;
    fromFile[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
}

const resolve = (key) => process.env[key] ?? fromFile[key];
const missing = KEYS.filter((key) => {
  const value = resolve(key);
  return !value || value.startsWith('PUT_');
});

if (missing.length > 0) {
  console.error('\nRelease signing is not configured. Missing or still a placeholder:\n');
  for (const key of missing) console.error(`  ${key}`);
  console.error(`\nSet these in ${GRADLE_PROPERTIES} (never in the repo), then retry.\n`);
  process.exit(1);
}

const storeFile = resolve('SUKUN_STORE_FILE');
if (!fs.existsSync(storeFile)) {
  console.error(`\nSUKUN_STORE_FILE points at a file that does not exist:\n  ${storeFile}\n`);
  process.exit(1);
}

console.log('Release signing: all four properties set, keystore present.');
