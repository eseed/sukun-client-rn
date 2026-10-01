import type * as ClarityModule from '@microsoft/react-native-clarity';
import type { Mixpanel } from 'mixpanel-react-native';
import type * as MetaModule from 'react-native-fbsdk-next';
import { hasReactNativeModule } from './nativeModules';

/**
 * The single gate in front of every analytics SDK in the app. Screens never call an SDK
 * directly, and no SDK starts on import — both Mixpanel (events) and Clarity (session replay)
 * only begin once `enableAnalytics()` is called, which happens after the consent decision in
 * `app/_layout.tsx`. Keeping them behind one switch is the point: a consent answer that
 * silenced events but left session recording running would not be consent.
 *
 * Both SDKs are native modules. A missing or failed native module must degrade rather than
 * crash the app, so every call across the bridge is guarded — including the module load
 * itself. Clarity builds a `NativeEventEmitter` as it imports and throws outright when its
 * native side is absent (a dev client built before the package was added, or Expo Go), and
 * Metro reports a throw during a module load as a fatal error that no `try` at the call site
 * can catch. So neither SDK is imported at the top of this file: both are loaded on first use,
 * and Clarity only once the registry confirms this binary carries it. See `nativeModules.ts`.
 *
 * EU data residency: this project stores EU user data, so Mixpanel talks to
 * `api-eu.mixpanel.com` rather than the default US endpoint.
 *
 * Meta's app SDK sits behind the same switch. It sends the purchase-journey events in
 * `meta-events.ts` to the Meta app connected to the website's Pixel dataset, plus Meta's own
 * install and app-open events once consent is given. It never receives the app user id, a name,
 * an email or a phone number, and it collects no advertising id (`plugins/withMetaAppEvents.js`).
 *
 * Environments are kept apart by giving each build its own Mixpanel project and its own
 * Clarity project, wired per EAS build profile. The ids are read from `EXPO_PUBLIC_*`, which
 * Expo inlines at build time, so a binary carries exactly one environment's ids and cannot be
 * pointed at another at runtime. They must be read as whole `process.env.EXPO_PUBLIC_X`
 * expressions for that inlining to happen: destructuring `process.env` breaks it.
 *
 * An id that is missing turns its SDK off rather than falling back to a default, so a
 * misconfigured build sends nothing instead of writing into the wrong project. `environment`
 * is also attached to every event and to the replay session, as a second line of defence: if
 * an id is ever wrong, the two datasets are still separable after the fact.
 */

const MIXPANEL_TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ?? '';
const MIXPANEL_EU_SERVER_URL = 'https://api-eu.mixpanel.com';
const CLARITY_PROJECT_ID = process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID ?? '';
const ANALYTICS_ENV = process.env.EXPO_PUBLIC_ANALYTICS_ENV ?? 'unknown';
const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID ?? '';

type Properties = Record<string, string | number | boolean>;

let enabled = false;
let mixpanel: Mixpanel | null = null;
let initPromise: Promise<Mixpanel | null> | null = null;
let clarityInitialized = false;

// A separate "looked up" flag rather than an `undefined` sentinel: a load Metro has swallowed
// returns `undefined` too, and reading that as "not looked up yet" would retry the load, and
// warn, on every event.
let clarityLookedUp = false;
let clarityModule: typeof ClarityModule | null = null;
let mixpanelLookedUp = false;
let mixpanelClass: typeof Mixpanel | null = null;
let metaLookedUp = false;
let metaModule: typeof MetaModule | null = null;
let metaStarted = false;

function getClarity(): typeof ClarityModule | null {
  if (clarityLookedUp) return clarityModule;
  clarityLookedUp = true;

  if (!CLARITY_PROJECT_ID) {
    console.warn('[analytics] no Clarity project id configured, session replay is off');
    return null;
  }

  // `ClarityEmitter` is the module Clarity turns into a `NativeEventEmitter` while importing,
  // so it is the one whose absence brings the app down. Leave the package unloaded without it.
  if (!hasReactNativeModule('ClarityEmitter')) {
    console.warn('[analytics] no Clarity module in this build, session replay is off');
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    clarityModule = (require('@microsoft/react-native-clarity') as typeof ClarityModule) ?? null;
  } catch (error) {
    console.warn('[analytics] Clarity failed to load', error);
  }
  return clarityModule;
}

function getMixpanelClass(): typeof Mixpanel | null {
  if (mixpanelLookedUp) return mixpanelClass;
  mixpanelLookedUp = true;

  if (!MIXPANEL_TOKEN) {
    console.warn('[analytics] no Mixpanel token configured, events are off');
    return null;
  }

  try {
    // Mixpanel reads `NativeModules` without dereferencing it, so its import survives a binary
    // that lacks it and only the calls fail, which `getInstance` already handles.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('mixpanel-react-native') as { Mixpanel: typeof Mixpanel } | undefined;
    mixpanelClass = loaded?.Mixpanel ?? null;
  } catch (error) {
    console.warn('[analytics] Mixpanel failed to load', error);
  }
  return mixpanelClass;
}

async function getInstance(): Promise<Mixpanel | null> {
  if (!enabled) return null;
  if (mixpanel) return mixpanel;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const MixpanelClass = getMixpanelClass();
        if (!MixpanelClass) return null;

        const instance = new MixpanelClass(MIXPANEL_TOKEN, true);
        await instance.init(false, undefined, MIXPANEL_EU_SERVER_URL);
        instance.registerSuperProperties({ environment: ANALYTICS_ENV });
        mixpanel = instance;
        return instance;
      } catch (error) {
        console.warn('[analytics] failed to initialize Mixpanel', error);
        return null;
      }
    })();
  }
  return initPromise;
}

/** Clarity cannot be re-initialized, so the first start initializes and later ones resume. */
function startClarity(): void {
  const Clarity = getClarity();
  if (!Clarity) return;

  try {
    if (!clarityInitialized) {
      Clarity.initialize(CLARITY_PROJECT_ID, { logLevel: Clarity.LogLevel.None });
      clarityInitialized = true;
      void Clarity.setCustomTag('environment', ANALYTICS_ENV).catch((error: unknown) =>
        console.warn('[analytics] Clarity setCustomTag failed', error),
      );
      return;
    }
    void Clarity.resume().catch((error: unknown) =>
      console.warn('[analytics] Clarity resume failed', error),
    );
  } catch (error) {
    console.warn('[analytics] Clarity failed to start', error);
  }
}

function pauseClarity(): void {
  const Clarity = getClarity();
  if (!clarityInitialized || !Clarity) return;

  try {
    void Clarity.pause().catch((error: unknown) =>
      console.warn('[analytics] Clarity pause failed', error),
    );
  } catch (error) {
    console.warn('[analytics] Clarity pause failed', error);
  }
}

/* ------------------------------------------------------------------ Meta */

function getMeta(): typeof MetaModule | null {
  if (metaLookedUp) return metaModule;
  metaLookedUp = true;

  if (!META_APP_ID) {
    console.warn('[analytics] no Meta app id configured, Meta app events are off');
    return null;
  }

  // The SDK's settings and its event logger are separate native modules; it needs both.
  if (!hasReactNativeModule('FBSettings') || !hasReactNativeModule('FBAppEventsLogger')) {
    console.warn('[analytics] no Meta SDK in this build, Meta app events are off');
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    metaModule = (require('react-native-fbsdk-next') as typeof MetaModule) ?? null;
  } catch (error) {
    console.warn('[analytics] Meta SDK failed to load', error);
  }
  return metaModule;
}

/**
 * The build leaves the SDK uninitialised and silent (`plugins/withMetaAppEvents.js`), so
 * consent is what starts it. Meta's automatic install and app-open events come on with it, and
 * go off again with `stopMeta`; the SDK itself cannot be shut down once started.
 */
function startMeta(): void {
  const meta = getMeta();
  if (!meta) return;

  try {
    meta.Settings.setAutoLogAppEventsEnabled(true);
    // Sends what the SDK queues again, after a withdrawal held it (see `stopMeta`).
    meta.AppEventsLogger.setFlushBehavior('auto');
    if (!metaStarted) {
      meta.Settings.initializeSDK();
      metaStarted = true;
    }
  } catch (error) {
    console.warn('[analytics] Meta SDK failed to start', error);
  }
}

function stopMeta(): void {
  const meta = getMeta();
  if (!meta || !metaStarted) return;

  try {
    meta.Settings.setAutoLogAppEventsEnabled(false);
    // Meta's App Dashboard toggle for automatic events outranks the app's own setting, so the
    // SDK may go on logging app opens for the rest of this session. Holding its queue keeps
    // them on the device; the next launch does not start the SDK at all without consent.
    meta.AppEventsLogger.setFlushBehavior('explicit_only');
  } catch (error) {
    console.warn('[analytics] Meta SDK failed to stop', error);
  }
}

/** The Meta standard events the app sends, by the website Pixel's names. See `meta-events.ts`. */
export type MetaEvent =
  | 'ViewContent'
  | 'Search'
  | 'FindLocation'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'CompleteRegistration'
  | 'AddPaymentInfo'
  | 'Purchase';

/** The same events under the SDK's names (`AppEventsLogger.AppEvents`). */
const META_APP_EVENT_NAMES: Record<MetaEvent, string> = {
  ViewContent: 'fb_mobile_content_view',
  Search: 'fb_mobile_search',
  FindLocation: 'FindLocation',
  AddToCart: 'fb_mobile_add_to_cart',
  InitiateCheckout: 'fb_mobile_initiated_checkout',
  CompleteRegistration: 'fb_mobile_complete_registration',
  AddPaymentInfo: 'fb_mobile_add_payment_info',
  Purchase: 'fb_mobile_purchase',
};

/** One line of `contents`: a ticket (by event id) or an extra (by option id), and how many. */
export interface MetaContent {
  id: string;
  quantity: number;
}

/**
 * Meta's own parameters, and only those, named as the website's Pixel names them so both send
 * the same thing. There is no room for a custom property, so nothing about the buyer can reach
 * Meta through here. Amounts are the server's figures.
 */
export interface MetaParameters {
  content_ids?: string[];
  content_type?: 'product';
  contents?: MetaContent[];
  /** The event's or extra's name, or a Discover tag; the SDK calls this its description. */
  content_name?: string;
  num_items?: number;
  search_string?: string;
  value?: number;
  currency?: string;
}

/** The website's parameter names in the SDK's own (`AppEventsLogger.AppEventParams`). */
function toAppEventParams(
  parameters: MetaParameters,
  orderId?: string,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (parameters.content_ids) params.fb_content_id = JSON.stringify(parameters.content_ids);
  if (parameters.contents) params.fb_content = JSON.stringify(parameters.contents);
  if (parameters.content_type) params.fb_content_type = parameters.content_type;
  if (parameters.content_name) params.fb_description = parameters.content_name;
  if (parameters.num_items !== undefined) params.fb_num_items = parameters.num_items;
  if (parameters.search_string) params.fb_search_string = parameters.search_string;
  if (parameters.currency) params.fb_currency = parameters.currency;
  if (orderId) params.fb_order_id = orderId;
  return params;
}

/**
 * One Meta app event. `value` travels as the SDK's value to sum, and a Purchase with a value
 * goes through `logPurchase`. `orderId` lets Meta recognise a repeat of the same order.
 * Screens call the helpers in `meta-events.ts`, which build the parameters, rather than this.
 */
export function trackMeta(
  event: MetaEvent,
  parameters: MetaParameters = {},
  options?: { orderId?: string },
): void {
  if (!enabled || !metaStarted) return;
  const meta = getMeta();
  if (!meta) return;

  const params = toAppEventParams(parameters, options?.orderId);
  try {
    if (event === 'Purchase' && parameters.value !== undefined && parameters.currency) {
      meta.AppEventsLogger.logPurchase(parameters.value, parameters.currency, params);
    } else if (parameters.value !== undefined) {
      meta.AppEventsLogger.logEvent(META_APP_EVENT_NAMES[event], parameters.value, params);
    } else {
      meta.AppEventsLogger.logEvent(META_APP_EVENT_NAMES[event], params);
    }
  } catch (error) {
    console.warn('[analytics] Meta event failed', event, error);
  }
}

/* --------------------------------------------------------------- consent */

/** What the app should do about analytics on this launch. */
export type ConsentDecision = 'granted' | 'denied' | 'ask';

/**
 * A stored answer is the user's explicit choice and outranks everything, in both directions:
 * a denial keeps holding after they travel somewhere we would not have asked, and a grant is
 * not re-prompted. The region check only decides whether someone who has *never* answered is
 * asked or quietly opted in.
 */
export function decideConsent(
  stored: string | null,
  regionRequiresPrompt: boolean,
): ConsentDecision {
  if (stored === 'granted') return 'granted';
  if (stored === 'denied') return 'denied';
  return regionRequiresPrompt ? 'ask' : 'granted';
}

/** Call once consent is granted — on first answer, or on every launch if already granted. */
export function enableAnalytics(): void {
  enabled = true;
  void getInstance();
  startClarity();
  startMeta();
}

/**
 * Call when consent is declined or revoked. Events become no-ops, session recording stops and
 * Meta's automatic install and app-open events stop; Mixpanel's local identity and queue are
 * cleared so nothing collected before the change is still waiting to go out.
 */
export function disableAnalytics(): void {
  pauseClarity();
  stopMeta();

  // Grabbed before the flag flips: `getInstance` refuses to hand anything back once disabled,
  // which would leave the queue it is meant to clear untouched.
  const pending = getInstance();
  enabled = false;

  void pending
    .then((instance) => instance?.reset())
    .catch((error: unknown) => console.warn('[analytics] reset on disable failed', error));
}

/** Whether analytics are currently running. Exposed for tests and for debug surfaces. */
export function analyticsEnabled(): boolean {
  return enabled;
}

export function track(event: string, properties?: Properties): void {
  void getInstance()
    .then((instance) => instance?.track(event, properties))
    .catch((error: unknown) => console.warn('[analytics] track failed', event, error));
}

/**
 * Ties both SDKs to the same identity, so a Mixpanel funnel and the session replay behind it
 * describe the same person. The app user id, never the phone number: the number is identity
 * to us (CLAUDE.md rule 1) and does not belong in a third-party analytics store.
 */
export function identify(userId: string): void {
  void getInstance()
    .then((instance) => instance?.identify(userId))
    .catch((error: unknown) => console.warn('[analytics] identify failed', error));

  const Clarity = getClarity();
  if (!enabled || !clarityInitialized || !Clarity) return;

  try {
    void Clarity.setCustomUserId(userId).catch((error: unknown) =>
      console.warn('[analytics] Clarity setCustomUserId failed', error),
    );
  } catch (error) {
    console.warn('[analytics] Clarity setCustomUserId failed', error);
  }
}

export function setUserProperties(properties: Properties): void {
  void getInstance()
    .then((instance) => instance?.getPeople().set(properties))
    .catch((error: unknown) => console.warn('[analytics] setUserProperties failed', error));
}

/**
 * Sign-out. Drops the Mixpanel identity and starts a fresh Clarity session, so the next person
 * on this device is not stitched onto the last one's recording.
 */
export function resetAnalytics(): void {
  void getInstance()
    .then((instance) => instance?.reset())
    .catch((error: unknown) => console.warn('[analytics] reset failed', error));

  const Clarity = getClarity();
  if (!enabled || !clarityInitialized || !Clarity) return;

  try {
    Clarity.startNewSession(() => undefined);
  } catch (error) {
    console.warn('[analytics] Clarity startNewSession failed', error);
  }
}
