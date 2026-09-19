#!/usr/bin/env bash
# Builds the release .aab and prints the certificate it was actually signed with.
#
# Four things this has to set up that a plain gradlew invocation does not:
#   - ANDROID_HOME is not exported in this shell profile, so Gradle has to be told where the
#     SDK is or it fails before it starts.
#   - The build profile's EXPO_PUBLIC_* variables, exported before Gradle starts. This is the
#     one that bites: Gradle runs the JS bundler as a child process, @expo/env loads
#     .env.local for a release bundle as readily as for a simulator, and it leaves a variable
#     alone only if the environment already defines it. Without this step a "production"
#     build silently takes .env.local's staging backend, staging analytics env, and no guest
#     flag at all, which is exactly what versionCode 2 shipped to Play.
#   - `expo prebuild`, run after that export rather than before it, so the generated project
#     and the bundle inside it are built from the same configuration.
#   - The two checks at the end. The certificate print catches a debug-signed bundle, which
#     Play would refuse; assert-bundle-env.mjs catches the failure above, which Play accepts.
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The profile whose environment gets compiled in; "production" unless told otherwise.
EAS_PROFILE="${1:-production}"
ENV_TMP="$(mktemp)"
trap 'rm -f "$ENV_TMP"' EXIT
node "$ROOT/scripts/eas-profile-env.mjs" "$EAS_PROFILE" android > "$ENV_TMP"
set -a
# shellcheck source=/dev/null
. "$ENV_TMP"
set +a
echo
echo "bundling with the \"$EAS_PROFILE\" profile:"
sed 's/^/  /' "$ENV_TMP"
echo

cd "$ROOT"
npx expo prebuild --platform android --clean

cd "$ROOT/android"
./gradlew --console=plain :app:bundleRelease

AAB="app/build/outputs/bundle/release/app-release.aab"
echo
echo "built: $ROOT/android/$AAB"
ls -lh "$AAB" | awk '{print "size:  " $5}'
echo
echo "signed with:"
keytool -printcert -jarfile "$AAB" | grep -E "Owner:|SHA256:" | sed 's/^/  /'
echo
node "$ROOT/scripts/assert-bundle-env.mjs" "$EAS_PROFILE" android "$ROOT/android/$AAB"
