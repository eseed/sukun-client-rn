const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');
// The plugin is compiled from an ES module, so the function is its `default`.
const withFacebook = require('react-native-fbsdk-next/app.plugin').default;

/**
 * Meta's app SDK (`react-native-fbsdk-next`), configured for the purchase-journey events in
 * `src/lib/meta-events.ts` and nothing else.
 *
 * The app id and client token come from the build profile (`EXPO_PUBLIC_META_APP_ID`,
 * `EXPO_PUBLIC_META_CLIENT_TOKEN` in eas.json), which the release scripts export before
 * prebuild. A profile without them gets a build whose SDK can never start: Meta's own plugin
 * refuses to run without an id, and the app starts the SDK only when the id was compiled in.
 *
 * Either way the SDK stays asleep until analytics consent: it is not initialised at launch,
 * logs nothing automatically and collects no advertising id. `enableAnalytics()` starts it and
 * turns on Meta's automatic install and app-open events; `disableAnalytics()` turns them off.
 *
 * Of the permissions Meta's Android library declares, the advertising id and the Privacy
 * Sandbox's targeting APIs (Topics, Protected Audience) are removed: the app measures campaigns,
 * it does not target ads, and it never asks for the IDFA, the Google Advertising ID or Apple's
 * tracking permission, as its privacy policy says. The Sandbox's attribution API stays, for
 * measuring installs without an advertising id. iOS gets Meta's SKAdNetwork ids from Meta's
 * plugin, which is how installs are measured there without tracking permission.
 */
const REMOVED_PERMISSIONS = [
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE',
];

/** What Meta's plugin writes for a configured build, written by hand for one without an id. */
const ASLEEP_ANDROID = {
  'com.facebook.sdk.AutoInitEnabled': 'false',
  'com.facebook.sdk.AutoLogAppEventsEnabled': 'false',
  'com.facebook.sdk.AdvertiserIDCollectionEnabled': 'false',
};
const ASLEEP_IOS = {
  FacebookAutoInitEnabled: false,
  FacebookAutoLogAppEventsEnabled: false,
  FacebookAdvertiserIDCollectionEnabled: false,
};

function withSdkAsleep(config) {
  config = withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    for (const [name, value] of Object.entries(ASLEEP_ANDROID)) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, name, value);
    }
    return config;
  });
  return withInfoPlist(config, (config) => {
    Object.assign(config.modResults, ASLEEP_IOS);
    return config;
  });
}

module.exports = function withMetaAppEvents(config) {
  config = AndroidConfig.Permissions.withBlockedPermissions(config, REMOVED_PERMISSIONS);

  const appID = process.env.EXPO_PUBLIC_META_APP_ID;
  const clientToken = process.env.EXPO_PUBLIC_META_CLIENT_TOKEN;
  if (!appID || !clientToken) return withSdkAsleep(config);

  return withFacebook(config, {
    appID,
    clientToken,
    displayName: 'Sukun',
    scheme: `fb${appID}`,
    isAutoInitEnabled: false,
    autoLogAppEventsEnabled: false,
    advertiserIDCollectionEnabled: false,
    iosUserTrackingPermission: false,
  });
};
