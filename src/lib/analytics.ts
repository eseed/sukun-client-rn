import * as Clarity from '@microsoft/react-native-clarity';
import { Mixpanel } from 'mixpanel-react-native';

/**
 * The single gate in front of every analytics SDK in the app. Screens never call an SDK
 * directly, and no SDK starts on import — both Mixpanel (events) and Clarity (session replay)
 * only begin once `enableAnalytics()` is called, which happens after the consent decision in
 * `app/_layout.tsx`. Keeping them behind one switch is the point: a consent answer that
 * silenced events but left session recording running would not be consent.
 *
 * Both SDKs are native modules. A missing or failed native module must degrade rather than
 * crash the app, so every call across the bridge is guarded.
 *
 * EU data residency: this project stores EU user data, so Mixpanel talks to
 * `api-eu.mixpanel.com` rather than the default US endpoint.
 */

const MIXPANEL_TOKEN = '71571cdae3de3136c0c4318927206845';
const MIXPANEL_EU_SERVER_URL = 'https://api-eu.mixpanel.com';
const CLARITY_PROJECT_ID = 'y6tknxh6u4';

type Properties = Record<string, string | number | boolean>;

let enabled = false;
let mixpanel: Mixpanel | null = null;
let initPromise: Promise<Mixpanel | null> | null = null;
let clarityInitialized = false;

async function getInstance(): Promise<Mixpanel | null> {
  if (!enabled) return null;
  if (mixpanel) return mixpanel;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const instance = new Mixpanel(MIXPANEL_TOKEN, true);
        await instance.init(false, undefined, MIXPANEL_EU_SERVER_URL);
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
  try {
    if (!clarityInitialized) {
      Clarity.initialize(CLARITY_PROJECT_ID, { logLevel: Clarity.LogLevel.None });
      clarityInitialized = true;
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
  if (!clarityInitialized) return;
  try {
    void Clarity.pause().catch((error: unknown) =>
      console.warn('[analytics] Clarity pause failed', error),
    );
  } catch (error) {
    console.warn('[analytics] Clarity pause failed', error);
  }
}

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
}

/**
 * Call when consent is declined or revoked. Events become no-ops and session recording stops;
 * Mixpanel's local identity and queue are cleared so nothing collected before the change is
 * still waiting to go out.
 */
export function disableAnalytics(): void {
  pauseClarity();

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

  if (!enabled || !clarityInitialized) return;

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

  if (!enabled || !clarityInitialized) return;

  try {
    Clarity.startNewSession(() => undefined);
  } catch (error) {
    console.warn('[analytics] Clarity startNewSession failed', error);
  }
}
