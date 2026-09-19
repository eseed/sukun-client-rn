# Sukun Client App (React Native)

Expo (managed) + Expo Router + TypeScript (strict). Client app for Sukun, a wellness/events
company in Egypt. English only, EGP only, Africa/Cairo.

This is **P0, UI-first**. Every screen is built against a mock api layer; the live backend
(NestJS, `../sukun-backend`, branch `staging`) is not deployed yet.

## Product rules — these are non-negotiable

1. **The phone number is identity.** Auth is phone + OTP. Email is for receipts and gates
   nothing. Numbers are canonical E.164 and may come from any country; the picker defaults to
   Egypt and lists it first. Exclusions live in one place per repo and must agree — see
   `EXCLUDED_COUNTRIES` in `src/lib/phone.ts` and in the backend's phone normalizer.
2. **A ticket can exist before its owner.** Guests are attached _by phone_ from contacts;
   their ticket binds when they register that number. There are no claim codes.
3. **The selfie is the anti-fraud control.** Captured at registration; required for a usable
   ticket.
4. **The system acts, it never confirms.** No screen may reveal whether a phone number is
   registered. Registered and unregistered guests get identical UI, identical copy, identical
   timing. Never branch UI on "user exists".
5. **App-only purchase.** There is no web checkout. Never add one.
6. **Non-users are reached over WhatsApp by the backend**, never by the app.
7. **Never compute prices client-side.** The server is authoritative. Mock prices live in
   `src/api/mock/`, never in a screen or component.
8. **Profile completeness gates purchase** — full name, email, date of birth, gender, area,
   and selfie. Email _verification_ gates nothing. The living area is only asked of, and only
   required of, an Egyptian number: `areas` are Egyptian governorates, so there is no answer
   to give from abroad. Use `requiresLivingArea` rather than testing the country by hand.
9. **Payments (P1):** follow the Paymob React Native SDK documentation exactly. Customize the
   sheet (`setAppName`, `setButtonBackgroundColor`, `setButtonTextColor`, …) _before_ calling
   `Paymob.presentPayVC(clientSecret, publicKey)`, and drive the payment outcome from
   `Paymob.setSdkListener` — `SUCCESS`, `FAIL`, `PENDING`, `CANCELLED`. Do not add behaviour
   the SDK docs do not describe.

### Out of scope

Classes, tokens, memberships, retreats, waitlists, transfers, in-app refunds, Arabic, and the
staff scanner (a separate app).

## Architecture

Screens never talk to the network. They read data through TanStack Query hooks in
`src/hooks/`, which call the api module in `src/api/`. `src/api/` exposes **one interface**
(`SukunApi`, in `src/api/contract.ts`) with two implementations:

- `src/api/mock/` — realistic in-memory data and all P0 business logic (pricing, promo,
  guest validation, hold expiry).
- `src/api/live/` — typed `fetch` against `EXPO_PUBLIC_API_BASE_URL`, to be filled in when
  staging is up. Endpoint paths are already wired from the backend controllers.

`src/api/index.ts` picks the implementation from `EXPO_PUBLIC_API_MODE` (`mock` | `live`).
**Screens must never know which is active.** Keep the interface stable: to wire a real
endpoint, implement it in `live/` — do not change screens.

Domain types in `src/api/types.ts` mirror the backend DTOs
(`sukun-backend/src/api/mobile/**` and `src/api/public/**`). Money is always a decimal
**string** in EGP, exactly as the backend sends it.

### Layout

```
app/                 expo-router routes only — thin, no business logic
src/theme/           design tokens (source of truth: Claude Design)
src/components/ui/   base components built from tokens
src/api/             contract + mock + live + types
src/hooks/           TanStack Query hooks (the only thing screens call)
src/stores/          Zustand (auth/session, checkout draft)
src/lib/             formatting, phone normalisation, secure storage, analytics
```

## Design system

Tokens in `src/theme/tokens.ts` are ported verbatim from the Claude Design project
(`_ds/sukun-design-system-.../tokens/*.css`). **Do not invent colour, spacing, or type
values** — if a value is missing, add it to the token file with a comment pointing at the
design, and use the token.

Fonts: Seriously Nostalgic (display, italic), Banana Grotesk (body), Minion Pro (serif
accent). The `.otf` files are licensed assets that live in the design project; see
`assets/fonts/README.md` for the drop-in step. The app falls back to system fonts until then.

## Commands

```
npm start          expo start
npm run typecheck  tsc --noEmit
npm run lint       eslint
npm test           jest
npm run verify     all three (run this before every commit)
```

### Releasing to iOS

The default is the local path: it builds on this Mac and uploads to TestFlight without EAS.

```
npm run release:ios:local
```

That runs `verify`, takes the next build number, archives, and uploads. The pieces are also
separately runnable: `npm run version:ios` to see or take the next build number,
`npm run build:ios:local` to produce `build/ios/Sukun.ipa`, `npm run publish:ios:local` to
upload one that already exists (`--validate` to check it without uploading).

EAS stays available as the fallback, for when this machine cannot build (no Xcode, a signing
problem, someone else releasing):

```
npm run release:ios
```

Both paths sign with the **same** certificate and profile and both take their build number
from what App Store Connect already has, so they can alternate freely. Never let Xcode or EAS
mint a second distribution certificate: Apple allows two per team, and the prompt to fix that
offers to revoke, which would break the other path.

What the local path needs, none of it in the repo:

- An **Apple Distribution certificate** in the login keychain, and the matching **App Store
  provisioning profile** for `co.sukunwellness` at `../secrets/sukun-appstore.mobileprovision`.
  Take both from EAS rather than making new ones: `eas credentials`, iOS, production, then
  download to `credentials.json`, import the `.p12` into the keychain and move the
  `.mobileprovision` into place.
- An **App Store Connect API key** (App Manager role) saved as
  `../secrets/AuthKey_<key id>.p8`, with its ids filled into `../secrets/ios-release.env`.

`scripts/assert-ios-signing.mjs` checks every one of those before Xcode starts and names
whichever is missing.

Only release when explicitly asked; never as a side effect of another task.

### Releasing to Android

Android also releases locally, from this Mac, and not from EAS:

```
npm run release:android:local
```

That runs `verify`, builds the signed `.aab`, and uploads it. The pieces are separately
runnable: `npm run build:android:local` produces
`android/app/build/outputs/bundle/release/app-release.aab`, and `npm run
publish:android:local` uploads one that already exists. The publisher takes
`--track internal|production`, `--status draft|completed`, and `--notes "<what's new>"`.
**Always pass `--notes`**: Play carries the previous release's notes forward when a release
omits them, so a silent changelog is the last release's, not an empty one.

Signing comes from four `SUKUN_*` properties in `~/.gradle/gradle.properties`, never the
repo; `scripts/assert-android-signing.mjs` checks them before Gradle starts, because
`withAndroidSigning.js` falls back to the debug keystore and Play rejects what that produces.

### What a release build compiles in

Both local scripts export the build profile's `EXPO_PUBLIC_*` variables from `eas.json`
(`scripts/eas-profile-env.mjs`) **before** they prebuild and bundle. This is not a nicety.
`.env.local` points the app at staging, the bundler loads it for a release build exactly as
it does for a simulator, and `@expo/env` defers to the environment only when the variable is
already set there. Skip the export and a "production" build ships staging's backend, staging's
analytics env (which is what shows the **Staging** badge on Profile), and no guest flag at
all, which defaults the skip-login link back on.

That is not hypothetical: it is what Android `versionCode 2` shipped to Play's production
track. `scripts/assert-bundle-env.mjs` now reads the finished `.aab` and fails the build if
the bundle does not carry the profile's url and analytics ids, or carries another profile's.
`src/__tests__/release-env.test.ts` guards the scripts themselves.

Guest browsing is a **build-time** variable, not a remote flag. There is no expo-updates
channel and nothing reads `Platform.OS`: iOS-on / Android-off lives only in `eas.json`, and
changing it means a new build. Nothing on Railway can turn it on or off.

### Build numbers

`eas.json` sets `appVersionSource: "local"`, so the build number is `ios.buildNumber` in
`app.json` and the version code is `android.versionCode`, tracked in git and read by both
paths. Before a local build, `scripts/ios-build-number.mjs` asks App Store Connect for the
highest build it holds and writes one past it, so the number is derived from the store rather
than from a counter either path could get ahead of. **Commit the bump**, or the next EAS build
starts from a stale number.

## Conventions

- Money: format with `formatEgp()` from `src/lib/format.ts`. Never `toFixed` in a screen.
- Phone: normalise with `src/lib/phone.ts` (E.164). Never hardcode a dial code or a digit
  count — both differ per country. Enter numbers through `PhoneField`, which pairs a country
  with a national number; display with `formatPhoneForDisplay` / `formatPhoneLocal`.
  `src/lib/countries.data.ts` is generated — do not edit it by hand.
- Dates: Africa/Cairo. Format with `src/lib/format.ts` helpers.
- Every screen that depends on P1 backend work is marked with a `PENDING BACKEND` comment at
  the top of the file, and lists what it needs.
- UI copy must never use em dashes (—). Use commas, periods, or colons instead.
- Analytics: call `src/lib/analytics.ts` only, never Mixpanel or Clarity directly. Both SDKs
  sit behind one consent switch (`enableAnalytics`/`disableAnalytics`) and neither starts on
  import, so a consent answer stops events _and_ session replay. Never put a name, email, or
  phone number in an event property or user property — identify by the app user id.
  `requiresPrivacyConsentGate()` decides who is asked; everyone else is not prompted.
- Analytics environments are separate projects, never a shared one with a filter: staging and
  production each have their own Mixpanel project and their own Clarity project. The ids are
  read from `EXPO_PUBLIC_MIXPANEL_TOKEN` / `EXPO_PUBLIC_CLARITY_PROJECT_ID` and set per EAS
  build profile in `eas.json`; `EXPO_PUBLIC_ANALYTICS_ENV` tags every event and replay session.
  Never hardcode an id back into `analytics.ts`, and never give a missing id a default: an
  unset id turns that SDK off, so a misconfigured build sends nothing rather than polluting the
  other environment. A new Mixpanel project must be created in the **EU** region, since the app
  posts to `api-eu.mixpanel.com`.
