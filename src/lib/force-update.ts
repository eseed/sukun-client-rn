import { Linking, Platform } from 'react-native';
import type { AppConfig, ForceUpdateRule } from '../api/types';
import { APP_VERSION } from './build-info';

/**
 * The force update switch: admins set a minimum store version per platform from the dashboard
 * (`public/app-config` carries it), and a build below it shows `ForceUpdateScreen` instead of
 * the app until it is updated from the store.
 *
 * It fails open everywhere it can fail. A version that cannot be read or parsed, a rule the
 * backend did not send, or a platform that has no store (web) never blocks: being wrongly
 * locked out of the app is worse than being let in on an old build for a little longer.
 */

export const NOT_FORCED: ForceUpdateRule = { enabled: false, minimumVersion: null };

/** App Store id of Sukun Wellness (`co.sukunwellness`). */
const APP_STORE_ID = '6804203454';
const ANDROID_PACKAGE = 'co.sukunwellness';

/** `2`, `2.1` or `2.1.0`, the same shape the backend accepts. */
const VERSION_PATTERN = /^\d+(\.\d+){0,2}$/;

function parseVersion(version: string): number[] | null {
  const trimmed = version.trim();
  if (!VERSION_PATTERN.test(trimmed)) return null;
  const parts = trimmed.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  return parts;
}

/**
 * Negative when `a` is older than `b`, zero when they are the same release, positive when `a`
 * is newer. Missing parts are zero, so `2.1` and `2.1.0` are equal. Null when either side is
 * not a plain version.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === null || right === null) return null;
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Which half of the backend's per-platform answer applies to this device. */
export function forceUpdateRuleFor(forceUpdate: AppConfig['forceUpdate']): ForceUpdateRule {
  if (!forceUpdate) return NOT_FORCED;
  if (Platform.OS === 'ios') return forceUpdate.ios ?? NOT_FORCED;
  if (Platform.OS === 'android') return forceUpdate.android ?? NOT_FORCED;
  return NOT_FORCED;
}

/** Whether this build has to update before it can be used. */
export function isUpdateRequired(rule: ForceUpdateRule, currentVersion = APP_VERSION): boolean {
  if (!rule.enabled || rule.minimumVersion === null || !currentVersion) return false;
  const comparison = compareVersions(currentVersion, rule.minimumVersion);
  return comparison !== null && comparison < 0;
}

/** For the keychain cache. */
export function serializeRule(rule: ForceUpdateRule): string {
  return JSON.stringify({ enabled: rule.enabled, minimumVersion: rule.minimumVersion });
}

/** The cached rule, or null when there is none or it is not one this build wrote. */
export function parseCachedRule(value: string | null): ForceUpdateRule | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ForceUpdateRule> | null;
    if (typeof parsed?.enabled !== 'boolean') return null;
    const minimumVersion = typeof parsed.minimumVersion === 'string' ? parsed.minimumVersion : null;
    return { enabled: parsed.enabled, minimumVersion };
  } catch {
    return null;
  }
}

/**
 * Where "Update now" goes: the store app itself, or the store's website when the store app
 * cannot be opened (a device without Play, a simulator).
 */
export function storeUrls(os: string = Platform.OS): { app: string; web: string } | null {
  if (os === 'ios') {
    return {
      app: `itms-apps://apps.apple.com/app/id${APP_STORE_ID}`,
      web: `https://apps.apple.com/app/id${APP_STORE_ID}`,
    };
  }
  if (os === 'android') {
    return {
      app: `market://details?id=${ANDROID_PACKAGE}`,
      web: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
    };
  }
  return null;
}

export async function openStoreListing(): Promise<void> {
  const urls = storeUrls();
  if (!urls) return;
  try {
    await Linking.openURL(urls.app);
  } catch {
    await Linking.openURL(urls.web).catch(() => undefined);
  }
}
