/**
 * Sets app.json's ios.buildNumber to one past the highest build App Store Connect has.
 *
 * App Store Connect is the only thing that actually refuses a duplicate build number, so it
 * is the only sound source for the next one. Deriving it here rather than from a counter is
 * what lets the local path and EAS alternate freely: whichever one builds next asks the store
 * where the numbering got to, so neither can hand the other a collision.
 *
 *   node scripts/ios-build-number.mjs          write the next number into app.json
 *   node scripts/ios-build-number.mjs --check  print what it would be, change nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, latestBuildNumber, loadConfig } from './ios-release-config.mjs';

const check = process.argv.includes('--check');
const config = loadConfig();
if (!fs.existsSync(config.keyFile)) {
  console.error(`No App Store Connect key at ${config.keyFile}`);
  process.exit(1);
}

const APP_JSON = path.join(ROOT, 'app.json');
const app = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
const current = Number.parseInt(app.expo.ios.buildNumber ?? '0', 10) || 0;

const latest = await latestBuildNumber(config);
const next = Math.max(latest, current) + 1;
console.log(`App Store Connect is at build ${latest}, app.json says ${current}. Next: ${next}.`);

if (check) process.exit(0);

app.expo.ios.buildNumber = String(next);
fs.writeFileSync(APP_JSON, `${JSON.stringify(app, null, 2)}\n`);
console.log(`app.json ios.buildNumber set to ${next}. Commit it so EAS sees the same number.`);
