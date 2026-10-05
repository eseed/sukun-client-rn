/**
 * The comparison that decides whether someone is locked out of the app. Every way it can be
 * unsure has to come out as "not required": a wrongly blocked user has no way back in but a
 * store update that may not exist yet.
 */
import { Platform } from 'react-native';
import {
  compareVersions,
  forceUpdateRuleFor,
  isUpdateRequired,
  parseCachedRule,
  serializeRule,
  storeUrls,
} from '../force-update';

// Hoisted above the imports by Jest, so `force-update` reads this as the installed version.
jest.mock('../build-info', () => ({ APP_VERSION: '2.1.0' }));

function setPlatform(os: string): void {
  (Platform as { OS: string }).OS = os;
}

afterEach(() => setPlatform('ios'));

describe('compareVersions', () => {
  it('orders by each part as a number, not as text', () => {
    expect(compareVersions('2.1.0', '2.10.0')).toBeLessThan(0);
    expect(compareVersions('2.9.9', '2.10.0')).toBeLessThan(0);
    expect(compareVersions('10.0.0', '9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.1.1', '2.1.0')).toBeGreaterThan(0);
  });

  it('reads missing parts as zero', () => {
    expect(compareVersions('2.1', '2.1.0')).toBe(0);
    expect(compareVersions('2', '2.0.0')).toBe(0);
    expect(compareVersions('2', '2.0.1')).toBeLessThan(0);
  });

  it('gives no answer for something that is not a plain version', () => {
    expect(compareVersions('2.1.0-beta', '2.1.0')).toBeNull();
    expect(compareVersions('2.1.0', '')).toBeNull();
    expect(compareVersions('abc', '1')).toBeNull();
  });
});

describe('isUpdateRequired', () => {
  const rule = (minimumVersion: string | null, enabled = true) => ({ enabled, minimumVersion });

  it('requires an update below an enabled minimum', () => {
    expect(isUpdateRequired(rule('2.2.0'), '2.1.0')).toBe(true);
    expect(isUpdateRequired(rule('2.1.1'), '2.1.0')).toBe(true);
  });

  it('lets the minimum itself and anything newer through', () => {
    expect(isUpdateRequired(rule('2.1.0'), '2.1.0')).toBe(false);
    expect(isUpdateRequired(rule('2.1'), '2.1.0')).toBe(false);
    expect(isUpdateRequired(rule('2.0.9'), '2.1.0')).toBe(false);
  });

  it('never requires one while the switch is off, whatever the version says', () => {
    expect(isUpdateRequired(rule('9.0.0', false), '2.1.0')).toBe(false);
  });

  it('fails open when either version cannot be read', () => {
    expect(isUpdateRequired(rule(null), '2.1.0')).toBe(false);
    expect(isUpdateRequired(rule('2.2.0'), '')).toBe(false);
    expect(isUpdateRequired(rule('not-a-version'), '2.1.0')).toBe(false);
  });

  it('reads the installed version by default', () => {
    expect(isUpdateRequired(rule('2.2.0'))).toBe(true);
    expect(isUpdateRequired(rule('2.1.0'))).toBe(false);
  });
});

describe('forceUpdateRuleFor', () => {
  const forceUpdate = {
    ios: { enabled: true, minimumVersion: '2.2.0' },
    android: { enabled: false, minimumVersion: null },
  };

  it('takes the half for this platform', () => {
    setPlatform('ios');
    expect(forceUpdateRuleFor(forceUpdate)).toEqual(forceUpdate.ios);
    setPlatform('android');
    expect(forceUpdateRuleFor(forceUpdate)).toEqual(forceUpdate.android);
  });

  it('forces nothing when the backend sent no rule, or there is no store', () => {
    expect(forceUpdateRuleFor(undefined)).toEqual({ enabled: false, minimumVersion: null });
    setPlatform('web');
    expect(forceUpdateRuleFor(forceUpdate)).toEqual({ enabled: false, minimumVersion: null });
  });
});

describe('the cached rule', () => {
  it('round-trips', () => {
    const rule = { enabled: true, minimumVersion: '2.2.0' };
    expect(parseCachedRule(serializeRule(rule))).toEqual(rule);
  });

  it('is ignored when missing or unreadable', () => {
    expect(parseCachedRule(null)).toBeNull();
    expect(parseCachedRule('not json')).toBeNull();
    expect(parseCachedRule('{"minimumVersion":"2.2.0"}')).toBeNull();
    expect(parseCachedRule('null')).toBeNull();
  });
});

describe('storeUrls', () => {
  it('opens the store app, with the website as the fallback', () => {
    expect(storeUrls('ios')).toEqual({
      app: 'itms-apps://apps.apple.com/app/id6804203454',
      web: 'https://apps.apple.com/app/id6804203454',
    });
    expect(storeUrls('android')).toEqual({
      app: 'market://details?id=co.sukunwellness',
      web: 'https://play.google.com/store/apps/details?id=co.sukunwellness',
    });
    expect(storeUrls('web')).toBeNull();
  });
});
