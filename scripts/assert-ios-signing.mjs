/**
 * Fails the local iOS release before Xcode starts unless it can actually be signed and
 * uploaded.
 *
 * Every check here is something that otherwise surfaces twenty minutes into an archive, or
 * worse, as an App Store Connect rejection after the upload. The certificate check is the
 * important one: a profile whose certificate is not in this keychain produces an archive that
 * exports with a confusing "no signing certificate" error, and a profile that has quietly
 * expired produces an .ipa that uploads and is then rejected.
 *
 * Nothing secret is printed. Only which piece is missing.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { BUNDLE_ID, ENV_FILE, PROFILE, loadConfig } from './ios-release-config.mjs';

const problems = [];
const note = (message) => problems.push(message);

const config = loadConfig({ required: false });
for (const key of config.missing) note(`${key} is not set in ${ENV_FILE}`);

if (config.keyFile && !fs.existsSync(config.keyFile)) {
  note(`No App Store Connect key at ${config.keyFile}`);
}

let profileCertHashes = [];
if (!fs.existsSync(PROFILE)) {
  note(`No provisioning profile at ${PROFILE}`);
} else {
  const decoded = execFileSync('security', ['cms', '-D', '-i', PROFILE]);
  const plist = JSON.parse(
    execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: decoded }).toString(),
  );

  const appId = plist.Entitlements?.['application-identifier'] ?? '';
  if (!appId.endsWith(`.${BUNDLE_ID}`)) {
    note(`Profile is for "${appId.split('.').slice(1).join('.')}", not ${BUNDLE_ID}`);
  }

  // An App Store profile provisions no specific devices. One that lists devices is an ad hoc
  // or development profile, which uploads and is then rejected.
  if (Array.isArray(plist.ProvisionedDevices)) {
    note('Profile lists devices, so it is development or ad hoc, not App Store');
  }

  const expires = new Date(plist.ExpirationDate);
  if (Number.isFinite(expires.valueOf()) && expires < new Date()) {
    note(`Profile expired on ${expires.toISOString().slice(0, 10)}`);
  } else if (Number.isFinite(expires.valueOf())) {
    const days = Math.round((expires - Date.now()) / 86_400_000);
    if (days < 21) console.warn(`Warning: the provisioning profile expires in ${days} days.`);
  }

  if (plist.TeamIdentifier && config.SUKUN_TEAM_ID && !plist.TeamIdentifier.includes(config.SUKUN_TEAM_ID)) {
    note(`Profile belongs to a different team than SUKUN_TEAM_ID`);
  }

  profileCertHashes = (plist.DeveloperCertificates ?? []).map((der) =>
    crypto.createHash('sha1').update(Buffer.from(der, 'base64')).digest('hex').toUpperCase(),
  );
  if (profileCertHashes.length === 0) note('Profile carries no certificate');
}

const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning']).toString();
const keychainHashes = [...identities.matchAll(/\)\s+([A-F0-9]{40})\s+"([^"]+)"/g)].map(
  ([, hash, name]) => ({ hash, name }),
);

const distribution = keychainHashes.filter(({ name }) => /Apple Distribution|iPhone Distribution/.test(name));
if (distribution.length === 0) {
  note('No Apple Distribution certificate in the login keychain');
}

if (profileCertHashes.length > 0 && keychainHashes.length > 0) {
  const match = keychainHashes.find(({ hash }) => profileCertHashes.includes(hash));
  if (!match) {
    note(
      'The provisioning profile\'s certificate is not in this keychain. Import the .p12 that ' +
        'goes with it (the same one EAS holds), not a different distribution certificate.',
    );
  } else {
    console.log(`Signing identity: ${match.name}`);
  }
}

if (problems.length > 0) {
  console.error('\nThe local iOS release is not ready:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nSee the "Releasing to iOS" section of CLAUDE.md for how to obtain each piece.\n');
  process.exit(1);
}

console.log('iOS release signing: certificate, App Store profile and API key all present.');
