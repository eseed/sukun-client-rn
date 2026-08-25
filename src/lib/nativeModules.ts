import { requireOptionalNativeModule } from 'expo-modules-core';
import { NativeModules } from 'react-native';

/**
 * Does this binary carry a given native module?
 *
 * Some packages reach for their native side while they are *being imported*: expo-localization
 * calls `requireNativeModule('ExpoLocalization')` at module scope, and Clarity builds a
 * `NativeEventEmitter` at module scope. On a binary without that module the import throws, and
 * Metro does not let the call site catch it: `metroRequire` wraps every module load in a guard
 * that hands the error to `ErrorUtils.reportFatalError` (a full-screen red box in development)
 * and returns `undefined` rather than rethrowing. A `try` around the `require` cannot help. The
 * only way to survive a missing module quietly is to never load the package.
 *
 * So these resolve the module the same way the packages themselves do, which makes the answer
 * exactly as accurate as the package's own lookup. Both registries exist under Jest too, so
 * `false` is a real absence rather than a test artefact; `jest.setup.js` registers a native
 * module for every package it mocks.
 *
 * This is a development-time concern. A release binary is built from the same lockfile as its
 * bundle, so it carries every module the bundle asks for. A stale simulator or dev client, one
 * built before a package was added, is where the mismatch shows up.
 */
export function hasExpoModule(name: string): boolean {
  // expo-modules-core's own resolver rather than a hand-rolled registry read: it installs the
  // registry if that has not happened yet, and falls back to the bridge proxy and the
  // TurboModule registry, so a module it cannot find is one expo-localization could not have
  // found either. It returns `null` instead of throwing, which is the whole reason it is safe
  // to call here. expo-modules-core itself is always present: every Expo binary is built on it.
  return requireOptionalNativeModule(name) != null;
}

export function hasReactNativeModule(name: string): boolean {
  return NativeModules[name] != null;
}
