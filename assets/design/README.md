# Design images

The screens reference fourteen images from the Claude Design project
(`https://claude.ai/design/p/6a8faa9e-25ec-48fa-a07a-d22123a33a73`), under `assets/`. All
fourteen are committed here and wired into `src/theme/assets.ts`.

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

Nine were pulled via the `DesignSync` tool's `get_file` (capped at 256 KB per file — fine for
the smaller crops and thumbnails). The five large full-bleed/decorative PNGs exceeded that cap
and were added by hand afterward. `src/theme/assets.ts` `require()`s all fourteen directly —
there's no `null`/fallback branch left to flip.
