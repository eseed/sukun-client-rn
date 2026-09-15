#!/usr/bin/env bash
# Builds the release .aab and prints the certificate it was actually signed with.
#
# ANDROID_HOME is not exported in this shell profile, so Gradle has to be told where the SDK
# is or it fails before it starts. The certificate print at the end is the check that the
# signing config took: a debug-signed bundle says "CN=Android Debug" and Play would refuse it.
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

cd "$(dirname "$0")/../android"
./gradlew --console=plain :app:bundleRelease

AAB="app/build/outputs/bundle/release/app-release.aab"
echo
echo "built: $(cd .. && pwd)/android/$AAB"
ls -lh "$AAB" | awk '{print "size:  " $5}'
echo
echo "signed with:"
keytool -printcert -jarfile "$AAB" | grep -E "Owner:|SHA256:" | sed 's/^/  /'
