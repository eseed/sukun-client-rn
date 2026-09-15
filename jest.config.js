module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-qrcode-svg|react-native-webview)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  // Screen suites mount a QueryClient and resolve several mock-api queries per render, and
  // jest.setup.js gives `waitFor` a 10s ceiling for that. Jest's own 5s default would cut a
  // slow-but-healthy test off before that ceiling, so it has to sit above it.
  testTimeout: 30000,
};
