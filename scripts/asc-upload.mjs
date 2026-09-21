/**
 * Validates and uploads the built .ipa to App Store Connect.
 *
 * The upload itself goes through altool, which ships inside Xcode: unlike Google Play there
 * is no plain HTTP endpoint for the binary, and altool is the supported path that takes an
 * API key rather than an Apple ID password. Everything around it, the pre-flight build number
 * check, speaks the App Store Connect REST API directly, so this carries no Ruby toolchain
 * and no npm supply chain.
 *
 * Usage:
 *   node scripts/asc-upload.mjs              validate, then upload
 *   node scripts/asc-upload.mjs --validate   validate only, upload nothing
 *
 * A rejected upload changes nothing on the store, so a mistake here costs a retry. The one
 * thing worth getting right first is the build number: App Store Connect refuses a duplicate,
 * and by then the archive has already been built.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { IPA, SECRETS, latestBuildNumber, loadConfig } from './ios-release-config.mjs';

const validateOnly = process.argv.includes('--validate');
const config = loadConfig();

for (const [label, file] of [['App Store Connect key', config.keyFile], ['ipa', IPA]]) {
  if (!fs.existsSync(file)) {
    console.error(`No ${label} at ${file}`);
    process.exit(1);
  }
}

// Read the number out of the artifact rather than app.json: the .ipa is what gets uploaded,
// and the two can drift if app.json moved after the archive was built.
const plist = execFileSync('unzip', ['-p', IPA, 'Payload/Sukun.app/Info.plist']);
const info = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: plist }));
const build = Number.parseInt(info.CFBundleVersion, 10);
console.log(`ipa: version ${info.CFBundleShortVersionString}, build ${build}`);

const latest = await latestBuildNumber(config);
if (build <= latest) {
  console.error(
    `\nApp Store Connect already has build ${latest}. Build ${build} would be refused.\n` +
      `Run "npm run version:ios" to take the next number, then rebuild.\n`,
  );
  process.exit(1);
}
console.log(`App Store Connect is at build ${latest}, so ${build} is free.`);

const altool = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'xcrun',
      ['altool', command, '-f', IPA, '-t', 'ios', '--apiKey', config.SUKUN_ASC_KEY_ID, '--apiIssuer', config.SUKUN_ASC_ISSUER_ID],
      { stdio: 'inherit', env: { ...process.env, API_PRIVATE_KEYS_DIR: SECRETS } },
    );
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`altool ${command} exited ${code}`))));
  });

try {
  console.log('\nvalidating ...');
  await altool('--validate-app');
  if (validateOnly) {
    console.log('\nvalid. Nothing was uploaded.');
    process.exit(0);
  }
  console.log('\nuploading ...');
  await altool('--upload-app');
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  console.error('Nothing was released. Fix the reason above and retry.');
  process.exit(1);
}

console.log(
  `\nuploaded. Build ${build} is processing in App Store Connect; it reaches TestFlight once\n` +
    `processing finishes, usually within about fifteen minutes.`,
);
