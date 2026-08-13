/* global jest */

// Screen and mock-api tests must not inherit a developer's live .env setting.
process.env.EXPO_PUBLIC_API_MODE = 'mock';

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

jest.mock('expo-contacts', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getContactsAsync: jest.fn(async () => ({ data: [] })),
  Fields: { PhoneNumbers: 'phoneNumbers', Name: 'name' },
}));

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('paymob-reactnative', () => ({
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
}), { virtual: true });
