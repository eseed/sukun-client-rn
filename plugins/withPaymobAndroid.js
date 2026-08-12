const { withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins');

/**
 * paymob-reactnative ships a native Android module that isn't Expo-autolinked config: its
 * README (https://developers.paymob.com/paymob-docs/developers/mobile-sdks/react-native-sdk)
 * asks for a jitpack + local-libs maven repo at the project level, and data binding enabled
 * at the app level. Expo regenerates android/ on every prebuild, so those two edits have to
 * be a config plugin rather than a one-off gradle change.
 */
function withPaymobProjectRepositories(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes('paymob-reactnative/android/libs')) {
      return config;
    }

    const marker = 'allprojects {\n    repositories {';
    if (!contents.includes(marker)) {
      throw new Error(
        'withPaymobAndroid: could not find `allprojects { repositories {` in the project build.gradle to insert the Paymob maven repos.'
      );
    }

    config.modResults.contents = contents.replace(
      marker,
      `${marker}\n` +
        `        maven {\n` +
        `            // Paymob SDK native binaries\n` +
        `            url = rootProject.projectDir.toURI().resolve("../node_modules/paymob-reactnative/android/libs")\n` +
        `        }\n` +
        `        maven {\n` +
        `            url = uri("https://jitpack.io")\n` +
        `        }`
    );
    return config;
  });
}

function withPaymobDataBinding(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes('dataBinding = true')) {
      return config;
    }

    const marker = 'android {';
    const index = contents.indexOf(marker);
    if (index === -1) {
      throw new Error(
        'withPaymobAndroid: could not find the `android {` block in the app build.gradle to enable data binding.'
      );
    }

    const insertAt = index + marker.length;
    config.modResults.contents =
      contents.slice(0, insertAt) +
      `\n    buildFeatures { dataBinding = true }` +
      contents.slice(insertAt);
    return config;
  });
}

module.exports = function withPaymobAndroid(config) {
  config = withPaymobProjectRepositories(config);
  config = withPaymobDataBinding(config);
  return config;
};
