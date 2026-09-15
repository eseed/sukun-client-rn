const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettier,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'coverage/**', 'android/**', 'ios/**'],
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
