const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettier,
  {
    // `build/**` is the local release output: `scripts/xcodebuild-release.sh` leaves an
    // .xcarchive and an .ipa there, and the archive contains a JS bundle that eslint will
    // happily try to lint. It is generated, like ios/ and android/ above it.
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'coverage/**',
      'android/**',
      'ios/**',
      'build/**',
    ],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'import/order': 'off',
    },
  },
  {
    // Build and release tooling. These run under Node on a developer machine, not in the
    // app bundle, so they get Node's globals and are allowed to talk to the terminal: a
    // release script that cannot print what it is about to publish is worse than useless.
    files: ['scripts/**/*.{js,mjs,cjs}', 'plugins/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        module: 'writable',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
