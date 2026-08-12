# Design images

The screens reference fourteen images from the Claude Design project
(`https://claude.ai/design/p/6a8faa9e-25ec-48fa-a07a-d22123a33a73`), under `assets/`:

| File                        | Used by                    |
| --------------------------- | -------------------------- |
| `deco-welcome-dancers.png`  | 01 Welcome (full bleed)    |
| `sukun-logo-black.png`      | 01 Welcome wordmark        |
| `sukun-logo-white.png`      | reserved (dark surfaces)   |
| `deco-swirl.png`            | 02 Phone number            |
| `deco-flower.png`           | 04 About you, 08/10 Checkout |
| `deco-youre-in.png`         | 12 Confirmation (full bleed) |
| `bg-profile-dots.png`       | 15 Profile (full bleed)    |
| `card-sukun-orange.png`     | 11 Payment                 |
| `slot-feat-tulua.webp`      | 06 Discover featured card  |
| `slot-event-hero.webp`      | 07 Event detail, 13 Ticket card |
| `slot-ev-slot-1.webp`       | 06 Discover list thumbnail |
| `slot-ev-slot-2.webp`       | 06 Discover list thumbnail |
| `slot-ev-slot-3.webp`       | 06 Discover list thumbnail |
| `slot-profile-avatar.webp`  | 15 Profile avatar          |

## Why they are not committed

They could not be pulled into this repo automatically: the design MCP's file read returns
base64 in-band (several are 400–680 KB, over the 256 KB read cap), and the direct design REST
API rejects the current token with `needs_consent: agent_design_projects`.

## To add them

1. Enable **Claude Design** access at `claude.ai/design/settings` (that clears the consent
   error), or download the files from the design project by hand.
2. Drop all fourteen into this directory with the exact filenames above.
3. In `src/theme/assets.ts`, replace each `null` with the `require(...)` already written on
   the line beside it.

No other change is needed. Until then `ImageSlot` renders a token-coloured wash at the same
size, so layout, aspect ratios and overlays are already correct.
