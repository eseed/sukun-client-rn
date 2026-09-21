#!/usr/bin/env bash
# Archives the App Store build and exports a signed .ipa, then prints what it was signed with.
#
# Three things this has to set up that a plain xcodebuild invocation does not:
#   - LANG, or CocoaPods 1.17 on Ruby 4 dies in pod install with an encoding error.
#   - The provisioning profile has to be installed where Xcode looks for it; it lives in
#     ../secrets so that it is shared with no one and committed nowhere.
#   - Manual signing, so that Xcode cannot decide to mint a new distribution certificate.
#     A new one can push the team over Apple's limit of two and tempt a revoke, which would
#     take EAS's builds down with it.
#
# `-jobs 4` caps the compile parallelism. Left unbounded, xcodebuild fans out across every
# core, a swift-frontend gets killed under the memory pressure, and the build dies with
# "the following command failed with exit code 0 but produced no further output" naming a
# pod that compiles perfectly well on its own. Capping it is what made the archive finish.
#
# The signing identity is taken from the profile itself rather than named here. Apple has
# issued distribution certificates under two common names, "Apple Distribution" and the older
# "iPhone Distribution", and the one EAS holds for this team is the older kind, so a
# hardcoded name matched nothing and the archive failed with "no signing certificate found".
# The profile's own certificate hash cannot be wrong about which key signs this build.
set -euo pipefail

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS="$(cd "$ROOT/.." && pwd)/secrets"
ENV_FILE="$SECRETS/ios-release.env"
PROFILE="$SECRETS/sukun-appstore.mobileprovision"
ARCHIVE="$ROOT/build/ios/Sukun.xcarchive"
EXPORT_DIR="$ROOT/build/ios"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi
mkdir -p "$EXPORT_DIR"

# Xcode reads profiles by UUID from this directory and nowhere else.
PROFILE_PLIST="$(security cms -D -i "$PROFILE")"
PROFILE_UUID="$(echo "$PROFILE_PLIST" | plutil -extract UUID raw -o - -)"
PROFILE_NAME="$(echo "$PROFILE_PLIST" | plutil -extract Name raw -o - -)"
PROFILE_CERT_SHA1="$(echo "$PROFILE_PLIST" | plutil -extract DeveloperCertificates.0 raw -o - - \
  | base64 -D | shasum -a 1 | awk '{print toupper($1)}')"
if ! security find-identity -v -p codesigning | grep -q "$PROFILE_CERT_SHA1"; then
  echo "The profile's certificate is not in the keychain. Import the .p12 EAS holds for it." >&2
  exit 1
fi
INSTALLED="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$INSTALLED"
cp "$PROFILE" "$INSTALLED/$PROFILE_UUID.mobileprovision"
echo "profile: $PROFILE_NAME ($PROFILE_UUID)"
echo "signing: $(security find-identity -v -p codesigning | grep "$PROFILE_CERT_SHA1" | sed 's/.*"\(.*\)"/\1/')"

# The profile is the same one EAS would build; "production" unless told otherwise.
EAS_PROFILE="${1:-production}"
ENV_TMP="$(mktemp)"
trap 'rm -f "$ENV_TMP"' EXIT
node "$ROOT/scripts/eas-profile-env.mjs" "$EAS_PROFILE" ios > "$ENV_TMP"
set -a
# shellcheck source=/dev/null
. "$ENV_TMP"
set +a
echo
echo "bundling with the \"$EAS_PROFILE\" profile:"
sed 's/^/  /' "$ENV_TMP"
echo

cd "$ROOT"
npx expo prebuild --platform ios --clean

rm -rf "$ARCHIVE" "$EXPORT_DIR/Sukun.ipa"
xcodebuild archive \
  -workspace ios/Sukun.xcworkspace \
  -scheme Sukun \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -quiet \
  -jobs 4 \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="$SUKUN_TEAM_ID" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  CODE_SIGN_IDENTITY="$PROFILE_CERT_SHA1"

# manageAppVersionAndBuildNumber must stay false: left on, Xcode rewrites the build number
# during export and the number App Store Connect receives stops being the one we chose.
cat > "$EXPORT_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$SUKUN_TEAM_ID</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key>
  <dict><key>co.sukunwellness</key><string>$PROFILE_NAME</string></dict>
  <key>uploadSymbols</key><true/>
  <key>stripSwiftSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_DIR/ExportOptions.plist" \
  -exportPath "$EXPORT_DIR" \
  -quiet

IPA="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
[ -n "$IPA" ] || { echo "export produced no .ipa"; exit 1; }
mv -f "$IPA" "$EXPORT_DIR/Sukun.ipa"

APP="$ARCHIVE/Products/Applications/Sukun.app"
echo
echo "built: $EXPORT_DIR/Sukun.ipa"
ls -lh "$EXPORT_DIR/Sukun.ipa" | awk '{print "size:  " $5}'
echo "version: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist") build $(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist")"
echo
echo "signed with:"
codesign -dvv "$APP" 2>&1 | grep -E "^Authority=|^TeamIdentifier=" | sed 's/^/  /'
