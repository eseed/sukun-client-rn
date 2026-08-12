# Sukun client app

React Native (Expo, managed) client for Sukun — a wellness/events company in Egypt.
English only, EGP only, Africa/Cairo.

This is **P0, UI-first**: every screen in the Claude Design project is built and running
against a mock api. The backend (NestJS, `../sukun-backend`, branch `staging`) is **not
deployed**, so nothing talks to a live server yet.

The product rules that govern this app are in [CLAUDE.md](./CLAUDE.md). Read those first —
several of them are the reason a screen is built the way it is.

## Running it

```bash
npm install
npm start          # then i / a / w
npm run verify     # typecheck + lint + tests — run before every commit
```

`npm start` runs against the mock api. The OTP code is `4242`, and the promo codes are
`SUKUN10` (−320.00 EGP) and `TULUA500` (−500.00 EGP).

There is a component gallery at `/gallery` showing every base component and token.

## Switching to the live backend

Copy `.env.example` to `.env`, set `EXPO_PUBLIC_API_MODE=live` and point
`EXPO_PUBLIC_API_BASE_URL` at staging. Nothing else changes: screens read through the
TanStack Query hooks in `src/hooks/`, which call the single `SukunApi` interface in
`src/api/contract.ts`. Endpoint paths in `src/api/live/` are already wired from the NestJS
controllers.

## Screens

All fifteen frames from `Sukun App - All Screens.dc.html`, plus two the design links to but
does not draw:

| #   | Screen                | Route                        |
| --- | --------------------- | ---------------------------- |
| 01  | Welcome               | `/(onboarding)/welcome`      |
| 02  | Phone number          | `/(onboarding)/phone`        |
| 03  | Verify code           | `/(onboarding)/otp`          |
| 04  | About you             | `/(onboarding)/profile`      |
| 05  | Selfie capture        | `/(onboarding)/selfie`       |
| 06  | Discover              | `/(tabs)/discover`           |
| 07  | Event detail          | `/event/[slug]`              |
| 08  | Checkout · pass       | `/checkout/pass`             |
| 09  | Checkout · guests     | `/checkout/guests`           |
| 10  | Checkout · review     | `/checkout/review`           |
| 11  | Payment               | `/checkout/payment`          |
| 12  | Confirmation          | `/checkout/confirmation`     |
| 13  | My tickets            | `/(tabs)/tickets`            |
| 14  | Entry pass / QR       | `/ticket/[id]`               |
| 15  | Profile               | `/(tabs)/profile`            |
| —   | Delete account        | `/account/delete`            |
| —   | Privacy & terms       | `/legal/terms`               |

## Pending backend

Two api methods have no endpoint on `staging`. Both are implemented in the mock so the
screens are real and demonstrable; `src/api/live/` throws a labelled `NOT_IMPLEMENTED`
rather than guessing a URL.

- **Rotating entry pass** (`tickets.entryPass`) — `MobileTicketsController` exposes
  list / detail / claim only. Expected response shape is `EntryPass` in `src/api/types.ts`.
  Screen 14 is built against it, countdown and rotation included.
- **Order price preview** (`orders.previewPrice`) — the server prices only at `POST /orders`,
  which also holds capacity, so it cannot double as a preview for the review screen. Either
  add `POST orders/preview`, or change screen 10 to create the order first and render its
  authoritative totals. Do **not** move the arithmetic into the screen.

Paymob is also not wired: screen 11 opens the hosted sheet and polls, and the mock settles a
simulated webhook a few seconds later.

## Deliberate differences from the design

Each of these is a place where the static design and the product rules disagree, or the
design leaves something out.

1. **VAT and total on screen 10.** The design shows `VAT (14%) 448.00` and
   `Total 3,328.00` on a 3,200.00 subtotal with a 320.00 promo — i.e. VAT charged on the
   subtotal, with the discount taken afterwards. The backend does the opposite:
   `net = subtotal − discount`, `vat = net × rate`, `total = net + vat`
   (`MobileOrderDetailResponseDto` — its own example, 750/100/650/91/741, confirms it).
   The app follows the backend, so the same basket renders `VAT (14%) 403.20` and
   `Total 3,283.20`. **The design's arithmetic needs correcting, or the server does.**
2. **Card fields on screen 11 are a non-editable preview.** The design draws card number,
   expiry and CVV inline. Collecting them in-app would put Sukun in PCI scope and invite
   treating a client redirect as settlement, which rule 9 forbids. The fields render as the
   design draws them but take no input; the CTA opens Paymob's hosted sheet and the app
   polls the server for the webhook result.
3. **Promo entry on screen 10.** The design shows an applied promo line but no way to enter
   a code, so a compact input/apply row was added above the terms checkbox.
4. **Sign out on screen 15.** The design's Account list has two rows; a third was added,
   since there is otherwise no way to leave a session.
5. **Guest count copy on screen 09** is derived from the order rather than hard-coded, so
   the "You bought 2 tickets. Attach 1 guest" line scales with the chosen quantity.

## Assets and fonts — action needed

Neither the fourteen design images nor the seven brand `.otf` files are in the repo. They
could not be pulled automatically: the design MCP's file read returns base64 in-band and
several images exceed its 256 KB cap, while the direct design REST API rejects the available
token with `needs_consent: agent_design_projects`.

Everything is wired for them, so adding them is a drop-in with no code change beyond flipping
one flag each:

- Images → [`assets/design/README.md`](./assets/design/README.md)
- Fonts → [`assets/fonts/README.md`](./assets/fonts/README.md)

Until then images render as token-coloured `ImageSlot` washes at the correct size and aspect
ratio, and type falls back to a platform serif/sans. Every size, weight, colour, spacing and
layout value is already correct.

## Verification

`npm run verify` runs typecheck, lint and 78 tests. The tests cover the money arithmetic,
phone normalisation, formatting, every base component, and — most importantly — the product
rules: profile completeness gates purchase, VAT applies to the discounted net, guest
validation reveals nothing about who is registered, tickets issue only when the webhook
settles, a guest's ticket is `pending_claim` until their number registers, and the entry pass
requires a selfie.

`app/__tests__/screens.test.tsx` renders all seventeen screens against the mock and asserts
the design's copy reaches the tree. It stands in for a simulator click-through: this machine
has Xcode but no iOS runtime installed, and browser automation was unavailable. Both
`expo export --platform ios` and `--platform web` bundle cleanly.
