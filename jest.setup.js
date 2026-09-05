/* global jest */

// Screen and mock-api tests must not inherit a developer's live .env setting.
process.env.EXPO_PUBLIC_API_MODE = 'mock';

// Analytics ids likewise: without them every SDK stays off, which is a case its own test
// covers deliberately rather than one the whole suite should run under.
process.env.EXPO_PUBLIC_ANALYTICS_ENV = 'test';
process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = 'test-mixpanel-token';
process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID = 'test-clarity-id';

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k);
    }),
  };
});

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(async () => {}),
  isLoaded: () => true,
}));

/**
 * The real `AppState` opens a native event subscription the moment it is touched, and under
 * Jest nothing ever closes it: the runner finishes the suite and then hangs forever. The
 * contacts hook only needs the listener contract, so this stands in for it.
 */
jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  },
}));

jest.mock('expo-contacts', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  // Never raises a sheet, which is what the hook uses for every background re-check.
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Contact: {
    getAllDetails: jest.fn(async () => []),
    presentAccessPicker: jest.fn(async () => []),
  },
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  addContactsChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  // iOS 18 only, so it reports itself unavailable and never renders under test.
  ContactAccessButton: { isAvailable: () => false },
}));

// The OS contact picker lives on the legacy entry point, which is a separate module path from
// 'expo-contacts' and so needs its own mock. Cancelled by default: a test that wants a contact
// back says so.
jest.mock('expo-contacts/legacy', () => ({
  presentContactPickerAsync: jest.fn(async () => null),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

/**
 * `WebView` is a native view, so under Jest it can only be a stand-in. It is a `jest.fn`
 * rather than a bare stub so a test can assert on the props the YouTube player passes it:
 * the embed URL and the inline-playback flags are the whole fix, and nothing else in the
 * suite can see them.
 */
jest.mock('react-native-webview', () => ({
  __esModule: true,
  WebView: jest.fn(() => null),
}));

jest.mock('mixpanel-react-native', () => {
  const people = { set: jest.fn(), setOnce: jest.fn() };
  return {
    Mixpanel: jest.fn().mockImplementation(() => ({
      init: jest.fn(async () => {}),
      track: jest.fn(),
      identify: jest.fn(async () => {}),
      getPeople: () => people,
      reset: jest.fn(),
      setServerURL: jest.fn(),
      registerSuperProperties: jest.fn(),
    })),
  };
});

jest.mock('@microsoft/react-native-clarity', () => ({
  initialize: jest.fn(),
  pause: jest.fn(async () => true),
  resume: jest.fn(async () => true),
  setCustomUserId: jest.fn(async () => true),
  setCustomTag: jest.fn(async () => true),
  startNewSession: jest.fn((cb) => cb && cb('session-id')),
  LogLevel: { None: 'None', Verbose: 'Verbose' },
}));

// `src/lib/nativeModules.ts` refuses to load a package whose native module is not in the
// binary, and it reads the same registries at test time. So every package mocked here also
// needs its native module registered, or the code under test will skip the mock as missing.
const { NativeModules } = require('react-native');
NativeModules.Clarity = NativeModules.Clarity ?? {};
NativeModules.ClarityEmitter = NativeModules.ClarityEmitter ?? {};
NativeModules.MixpanelReactNative = NativeModules.MixpanelReactNative ?? {};
if (globalThis.expo?.modules) {
  globalThis.expo.modules.ExpoLocalization = globalThis.expo.modules.ExpoLocalization ?? {};
}

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ regionCode: 'EG' }]),
  getCalendars: jest.fn(() => [{ timeZone: 'Africa/Cairo' }]),
}));

jest.mock(
  'paymob-reactnative',
  () => ({
    __esModule: true,
    default: {
      setAppName: jest.fn(),
      setButtonBackgroundColor: jest.fn(),
      setButtonTextColor: jest.fn(),
      setAppIcon: jest.fn(),
      setShowSaveCard: jest.fn(),
      setSaveCardDefault: jest.fn(),
      setShowConfirmationPage: jest.fn(),
      setShowTransactionResult: jest.fn(),
      setKeyboardHandlingEnabled: jest.fn(),
      presentPayVC: jest.fn(),
      setSdkListener: jest.fn(),
      removeSdkListener: jest.fn(),
    },
    PaymentStatus: { SUCCESS: 'Success', FAIL: 'Fail', CANCELLED: 'Cancelled', PENDING: 'Pending' },
  }),
  { virtual: true },
);

/**
 * `waitFor`'s default budget is 1000ms, and a screen test here mounts a QueryClient, resolves
 * several mock-api queries and re-renders the tree inside that budget. On a busy machine that
 * is not enough: suites went red at a `waitFor` that then succeeded at ~1.3-4.5s, with nothing
 * wrong behind it. A generous ceiling makes a loaded machine a slow run rather than a false
 * failure; a genuinely stuck screen still fails, just later.
 */
require('@testing-library/react-native').configure({ asyncUtilTimeout: 10000 });
