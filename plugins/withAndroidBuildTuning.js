const { withGradleProperties } = require('expo/config-plugins');

/**
 * Two gradle.properties edits that the release build needs once R8 is on. Expo regenerates
 * android/ on every prebuild, so these have to be a config plugin rather than a one-off edit,
 * and expo-build-properties has no option for either of them.
 *
 * 1. Heap. The Expo template pins `org.gradle.jvmargs` at 2 GB, which is enough to build the
 *    app but not to run R8 over it: `:app:minifyReleaseWithR8` dies with an OutOfMemoryError.
 *    The cap is on the JVM, not the machine, so a roomier CI worker does not fix it on its own.
 *    5 GB clears R8 and still leaves headroom on an 8 GB EAS worker.
 *
 * 2. R8 full mode, which AGP 8 turns on by default, drops assumptions that reflective code
 *    relies on, beyond what `-keep` rules describe. Paymob reaches its checkout sheet through
 *    data binding and reflection, so the build runs in compatibility mode instead. It shrinks
 *    marginally less and is much less likely to break at runtime.
 */
const PROPERTIES = [
  { key: 'org.gradle.jvmargs', value: '-Xmx5120m -XX:MaxMetaspaceSize=1024m' },
  { key: 'android.enableR8.fullMode', value: 'false' },
];

module.exports = function withAndroidBuildTuning(config) {
  return withGradleProperties(config, (config) => {
    for (const { key, value } of PROPERTIES) {
      const existing = config.modResults.find(
        (item) => item.type === 'property' && item.key === key,
      );

      if (existing) {
        existing.value = value;
      } else {
        config.modResults.push({ type: 'property', key, value });
      }
    }

    return config;
  });
};
