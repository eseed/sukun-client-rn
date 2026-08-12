# Sukun Client App (React Native)

Expo (managed) + Expo Router + TypeScript (strict). Client app for Sukun, a wellness/events
company in Egypt. English only, EGP only, Africa/Cairo.

This is **P0, UI-first**. Every screen is built against a mock api layer; the live backend
(NestJS, `../sukun-backend`, branch `staging`) is not deployed yet.

## Product rules — these are non-negotiable

1. **The phone number is identity.** Auth is phone + OTP. Email is for receipts and gates
   nothing.
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
   and selfie. Email _verification_ gates nothing.
9. **Payments (P1):** open Paymob's native SDK sheet (`paymob-reactnative`, via
   `Paymob.presentPayVC`) and poll status. An order is `paid` only via the server webhook —
   never trust a client redirect, and never trust the SDK's own success/fail callback either.

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
src/lib/             formatting, phone normalisation, secure storage
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

## Conventions

- Money: format with `formatEgp()` from `src/lib/format.ts`. Never `toFixed` in a screen.
- Phone: normalise with `src/lib/phone.ts` (E.164, `+20`). Display uses the local format.
- Dates: Africa/Cairo. Format with `src/lib/format.ts` helpers.
- Every screen that depends on P1 backend work is marked with a `PENDING BACKEND` comment at
  the top of the file, and lists what it needs.
