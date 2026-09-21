const { withAppBuildGradle } = require('@expo/config-plugins');

const GOOGLE_MEASUREMENT_DEPENDENCIES = [
  'implementation("com.android.installreferrer:installreferrer:2.2")',
  'implementation("com.google.android.gms:play-services-appset:16.1.0")',
];

/** Add Kochava's measurement-only Google dependencies to the generated Android app. */
module.exports = function withKochavaGoogleMeasurement(config) {
  return withAppBuildGradle(config, (config) => {
    const { contents, language } = config.modResults;
    if (language !== 'groovy') {
      throw new Error('Kochava Google Measurement currently expects app/build.gradle (Groovy).');
    }

    const missingDependencies = GOOGLE_MEASUREMENT_DEPENDENCIES.filter(
      (dependency) => !contents.includes(dependency),
    );
    if (missingDependencies.length === 0) return config;

    const dependenciesBlock = /^(dependencies\s*\{)/m;
    if (!dependenciesBlock.test(contents)) {
      throw new Error('Could not find the app dependencies block for Kochava Google Measurement.');
    }

    const additions = [
      '    // Sukun Kochava Google Measurement (install referrer and App Set ID only)',
      ...missingDependencies.map((dependency) => `    ${dependency}`),
    ].join('\n');
    config.modResults.contents = contents.replace(dependenciesBlock, `$1\n${additions}`);
    return config;
  });
};
