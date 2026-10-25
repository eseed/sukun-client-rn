# Security upgrades — October 2026

Repository: `sukun-client-rn`
Branch: `chore/security-upgrades-2026-10-prod`
Cutoff for advisory data: **2026-10-25**
Runtime: **Node.js 22.23.4**, npm **10.9.9**

Production note: this branch is a cherry-pick of staging commit `acc82a3` (PR #53). The dependency
graph and lockfile are identical to staging; all gates were re-run on this branch.

This document records the Node runtime pin, the Expo SDK 57 patch alignment, npm dependency
remediation, every remaining audit finding, and the before/after verification evidence.

## Scope and method

The change is limited to Node runtime pins, `package.json`/`package-lock.json`, `eas.json`, and this
report. No application source, tests, or native project files were changed.

Sources consulted:

- Node.js October 2026 security release article:
  <https://nodejs.org/en/blog/vulnerability/october-2026-security-releases>
- Node.js v22.23.4 release notes: <https://nodejs.org/en/blog/release/v22.23.4>
- Local runtime evidence from `node --version` and `process.versions`.
- `npm audit` / `npm audit --omit=dev` against the npm registry.
- GitHub Advisory Database metadata collected for this review, plus each advisory URL listed
  below.
- npm registry metadata through `npm ls`, `npm outdated`-equivalent resolution, and package
  changelogs for Expo SDK 57 patch releases.
- OSV/NVD identifiers as recorded by the GitHub Advisory Database (CVE IDs are quoted from that
  metadata).

Method:

1. Captured the baseline audit state: 35 findings (1 critical, 17 high, 16 moderate, 1 low); 16
   findings with `--omit=dev` (1 critical, 8 high, 7 moderate).
2. Pinned Node.js 22.23.4 in every mechanism the repository controls.
3. Ran `npx expo install expo@~57.0.31` and `npx expo install --fix` to stay inside Expo SDK 57
   (no SDK, React Native, or React major upgrade).
4. Ran `npm update` to take in-range direct and transitive patches, then `npm audit fix` without
   `--force`. `npm audit fix` made no changes; the reductions below came from Expo alignment,
   `npm update`, and explicit scoped overrides.
5. Added only same-major overrides for findings that remained, plus the explicitly requested
   `uuid` override for vulnerable pre-11 copies.
6. Rebuilt the lockfile cleanly and validated it with `npm ci`.
7. Ran lint, typecheck, tests, Expo config resolution, and an Android export.

## A. Node.js runtime and bundled dependencies

### Installed runtime evidence

```text
$ node --version
v22.23.4

$ npm --version
10.9.9

$ node -p process.execPath
C:\Program Files\nodejs\node.exe
```

Selected values from `process.versions` on the installed executable:

| Component         | Installed value                                  |
| ----------------- | ------------------------------------------------ |
| Node.js           | 22.23.4                                          |
| Undici (internal) | 6.29.1                                           |
| OpenSSL           | 3.5.9                                            |
| c-ares            | 1.34.9                                           |
| SQLite            | 3.53.4                                           |
| Brotli            | 1.1.0                                            |
| tz                | 2026e                                            |
| V8                | 12.4.254.21-node.57                              |
| NSS root certs    | 3.131.1 (per the official 22.23.4 release notes) |

These components are part of the Node executable. Updating them does not update npm-installed
copies of the same packages.

### Node 22 CVEs fixed by 22.23.4

| CVE             | Severity | Component                              | Fixed in 22.23.4 |
| --------------- | -------- | -------------------------------------- | ---------------- |
| CVE-2026-105482 | high     | `dns.resolve` NUL truncation           | yes              |
| CVE-2026-106069 | high     | TLS non-canonical IPv4 hostname        | yes              |
| CVE-2026-111497 | high     | Brotli out-of-bounds write             | yes              |
| CVE-2026-105481 | medium   | HTTP Agent keep-alive response         | yes              |
| CVE-2026-106072 | medium   | TLS DNS SAN for non-canonical IPv4     | yes              |
| CVE-2026-106074 | medium   | crypto entropy caches in snapshots/SEA | yes              |
| CVE-2026-106073 | low      | Permission Model `fs.realpathSync`     | yes              |

The following CVEs in the same release do **not** affect Node 22 and are not claimed here:
CVE-2026-105483 (Node 24/26 only), CVE-2026-106070 (Node 26 only), and CVE-2026-106071
(Node 26 only).

### Where the runtime is pinned

| Location                              | Value           |
| ------------------------------------- | --------------- |
| `.nvmrc` (new)                        | `22.23.4`       |
| `.node-version` (new)                 | `22.23.4`       |
| `package.json` → `engines.node` (new) | `>=22.23.4 <23` |
| `eas.json` → `build.development.node` | `22.23.4`       |
| `eas.json` → `build.staging.node`     | `22.23.4`       |
| `eas.json` → `build.production.node`  | `22.23.4`       |

No Node 24 or Node 26 pin was added. The repository has no CI configuration, so there was no CI
runtime file to update.

## B. Direct npm dependencies

### B.1 Direct dependencies with an applicable advisory

#### `zod` (direct, production runtime)

| Field              | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| Installed before   | 4.4.3                                                    |
| Installed after    | **4.6.7**                                                |
| Advisory           | GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404                     |
| Published          | 2026-10-01                                               |
| Severity           | high                                                     |
| Affected / patched | `< 4.6.6` / `4.6.6`                                      |
| Direct             | yes                                                      |
| Used by app        | yes — runtime request/response and form validation       |
| Prod/dev           | production                                               |
| Remediation        | `npm update` to 4.6.7; manifest range raised to `^4.6.7` |
| Residual           | none for the direct copy                                 |
| Source             | <https://github.com/advisories/GHSA-mrhx-c7xc-m3w5>      |

The direct requirement is now `^4.6.7`, so a fresh install cannot resolve the vulnerable
4.4.x line. The separate `zod@3.25.76` copy under `@expo/cli` is a build-time residual and is
documented in section E.

#### `mixpanel-react-native` (direct, production runtime)

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Installed before   | 3.6.0                                                                      |
| Installed after    | **3.8.1**                                                                  |
| Advisory           | GHSA-w5hq-g745-h8pq / CVE-2026-41907 (via `uuid`)                          |
| Published          | 2026-04-22                                                                 |
| Severity           | moderate                                                                   |
| Affected / patched | `uuid < 11.1.1` / `11.1.1`                                                 |
| Direct             | yes                                                                        |
| Used by app        | yes — analytics                                                            |
| Prod/dev           | production                                                                 |
| Remediation        | `npm update` took 3.8.1; `overrides` forces `uuid` 11.1.1 for this package |
| Installed after    | `mixpanel-react-native@3.8.1`, `uuid@11.1.1` (deduped)                     |
| Residual           | none reported by `npm audit`                                               |
| Source             | <https://github.com/advisories/GHSA-w5hq-g745-h8pq>                        |

`uuid` v11 still exposes the CommonJS `v4()` API that Mixpanel uses. `npx expo config --type
public` and `npx expo export` both succeed with this override.

#### `expo` (direct, production, CLI tree is build-time)

| Field            | Value                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Installed before | 57.0.24                                                                                                       |
| Installed after  | **57.0.31**                                                                                                   |
| Advisory         | No direct `expo` vulnerability; audit marks `expo` high because it contains `@expo/cli` (`node-forge`, `zod`) |
| Severity         | high (inherited)                                                                                              |
| Direct           | yes                                                                                                           |
| Used by app      | yes — Expo runtime/SDK                                                                                        |
| Prod/dev         | production                                                                                                    |
| Remediation      | `npx expo install expo@~57.0.31`                                                                              |
| Residual         | inherited build-time `node-forge` and `@expo/cli` `zod` findings; see section E                               |
| Source           | <https://github.com/advisories/GHSA-86w9-cpqp-85rv>, <https://github.com/advisories/GHSA-mrhx-c7xc-m3w5>      |

`expo` is a production dependency, so `npm audit --omit=dev` includes its CLI tree. The Expo CLI,
code-signing, and config tooling are not bundled into the application JS.

#### `expo-router` (direct, production runtime)

| Field              | Value                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Installed before   | 57.0.17                                                                                                          |
| Installed after    | **57.0.29**                                                                                                      |
| Advisory           | GHSA-vcc3-ghjq-m6fr / CVE-2026-45822 (via `query-string` → `decode-uri-component`)                               |
| Published          | 2026-08-31                                                                                                       |
| Severity           | moderate                                                                                                         |
| Affected / patched | `decode-uri-component <= 0.4.2` / `0.5.0`                                                                        |
| Direct             | yes                                                                                                              |
| Used by app        | yes — routing and deep-link query parsing                                                                        |
| Prod/dev           | production                                                                                                       |
| Remediation        | `npx expo install --fix` moved expo-router to 57.0.29 and query-string to 7.1.3                                  |
| Residual           | `decode-uri-component@0.2.2` remains; 0.5.x is ESM-only and incompatible with CJS query-string 7 — see section E |
| Source             | <https://github.com/advisories/GHSA-vcc3-ghjq-m6fr>                                                              |

#### `eas-cli` (direct, development/build tooling)

| Field            | Value                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed before | 23.2.0                                                                                                                                                        |
| Installed after  | 23.2.0 (no newer 23.x available)                                                                                                                              |
| Advisory         | Inherited `node-forge`, `diff`, `ts-deepmerge`, `jks-js`, `@expo/code-signing-certificates`, `@expo/pkcs12`                                                   |
| Severity         | high (inherited)                                                                                                                                              |
| Direct           | yes                                                                                                                                                           |
| Used by app      | no — EAS build/submit CLI only                                                                                                                                |
| Prod/dev         | development                                                                                                                                                   |
| Remediation      | Same-major overrides for `ajv`, `joi`, `minimatch`, `nanoid`, `tar`, `yaml`; no major overrides for `diff` or `ts-deepmerge`                                  |
| Residual         | `node-forge` (no patch), `diff` (major-only patch), `ts-deepmerge` (major-only patch); see section E                                                          |
| Source           | <https://github.com/advisories/GHSA-86w9-cpqp-85rv>, <https://github.com/advisories/GHSA-73rr-hh4g-fpgx>, <https://github.com/advisories/GHSA-87mf-gv2c-c62c> |

### B.2 Direct dependencies with no applicable advisory

The following direct packages have **no known applicable advisory found as of October 25, 2026**.
Versions are the installed versions after this change.

| Package                                   | Installed              | Type |
| ----------------------------------------- | ---------------------- | ---- |
| `@expo/metro-runtime`                     | 57.0.17                | prod |
| `@hookform/resolvers`                     | 5.9.2                  | prod |
| `@microsoft/react-native-clarity`         | 4.9.2                  | prod |
| `@react-native-community/datetimepicker`  | 9.1.0                  | prod |
| `@react-native-picker/picker`             | 2.11.4                 | prod |
| `@tanstack/react-query`                   | 5.104.5                | prod |
| `expo-application`                        | 57.0.3                 | prod |
| `expo-brightness`                         | 57.0.2                 | prod |
| `expo-build-properties`                   | 57.0.22                | prod |
| `expo-calendar`                           | 57.0.6                 | prod |
| `expo-constants`                          | 57.0.22                | prod |
| `expo-contacts`                           | 57.0.8                 | prod |
| `expo-crypto`                             | 57.0.4                 | prod |
| `expo-dev-client`                         | 57.0.20                | prod |
| `expo-document-picker`                    | 57.0.3                 | prod |
| `expo-file-system`                        | 57.0.7                 | prod |
| `expo-font`                               | 57.0.4                 | prod |
| `expo-image`                              | 57.0.5                 | prod |
| `expo-image-picker`                       | 57.0.20                | prod |
| `expo-keep-awake`                         | 57.0.2                 | prod |
| `expo-linking`                            | 57.0.13                | prod |
| `expo-localization`                       | 57.0.2                 | prod |
| `expo-notifications`                      | 57.0.24                | prod |
| `expo-secure-store`                       | 57.0.4                 | prod |
| `expo-splash-screen`                      | 57.0.10                | prod |
| `expo-status-bar`                         | 57.0.1                 | prod |
| `libphonenumber-js`                       | 1.13.15                | prod |
| `paymob-reactnative`                      | 1.0.0 (git `33428ada`) | prod |
| `react`                                   | 19.2.3                 | prod |
| `react-dom`                               | 19.2.3                 | prod |
| `react-hook-form`                         | 7.91.0                 | prod |
| `react-native`                            | 0.86.3                 | prod |
| `react-native-fbsdk-next`                 | 13.4.3                 | prod |
| `react-native-gesture-handler`            | 2.32.0                 | prod |
| `react-native-kochava-measurement`        | 5.0.0                  | prod |
| `react-native-kochava-measurement-google` | 5.0.0                  | prod |
| `react-native-qrcode-svg`                 | 6.3.27                 | prod |
| `react-native-reanimated`                 | 4.5.1                  | prod |
| `react-native-safe-area-context`          | 5.7.0                  | prod |
| `react-native-screens`                    | 4.26.2                 | prod |
| `react-native-svg`                        | 15.15.4                | prod |
| `react-native-web`                        | 0.21.4                 | prod |
| `react-native-webview`                    | 13.16.1                | prod |
| `react-native-worklets`                   | 0.10.1                 | prod |
| `zustand`                                 | 5.0.16                 | prod |
| `@react-native/jest-preset`               | 0.86.3                 | dev  |
| `@testing-library/react-native`           | 13.3.3                 | dev  |
| `@types/jest`                             | 29.5.14                | dev  |
| `@types/react`                            | 19.2.18                | dev  |
| `eslint`                                  | 9.39.5                 | dev  |
| `eslint-config-expo`                      | 57.0.2                 | dev  |
| `eslint-config-prettier`                  | 10.1.8                 | dev  |
| `jest`                                    | 29.7.0                 | dev  |
| `jest-environment-node`                   | 29.7.0                 | dev  |
| `jest-expo`                               | 57.0.6                 | dev  |
| `prettier`                                | 3.9.10                 | dev  |
| `react-test-renderer`                     | 19.2.3                 | dev  |
| `typescript`                              | 6.0.3                  | dev  |

`react-test-renderer` was pinned from `^19.2.3` to exactly `19.2.3` because `npm update` had taken
19.3.1 while `react` is intentionally pinned at 19.2.3; `@testing-library/react-native` requires the
renderer to match React exactly. This is a dev-only lock alignment, not an app source change.

## C. Transitive npm dependencies

### C.1 Residual transitive findings

All five unique residual advisories are listed here. The audit count of 13 is larger than five
because npm reports parent packages that inherit a child finding.

| Package                | Installed | Advisory / CVE                       | Published  | Severity | Affected → patched                  | Dependency path                                                                                                                                                                        | Exposure                       |
| ---------------------- | --------- | ------------------------------------ | ---------- | -------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `node-forge`           | 1.4.0     | GHSA-86w9-cpqp-85rv / CVE-2026-85393 | 2026-09-03 | high     | `<= 1.4.0` → **no patched release** | `expo → @expo/cli → node-forge`; `expo → @expo/cli → @expo/code-signing-certificates → node-forge`; `eas-cli → @expo/code-signing-certificates`, `@expo/pkcs12`, `jks-js → node-forge` | build-time only                |
| `zod`                  | 3.25.76   | GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 | 2026-10-01 | high     | `< 4.6.6` → `4.6.6`                 | `expo → @expo/cli → zod@3.25.76`                                                                                                                                                       | build-time CLI validation only |
| `decode-uri-component` | 0.2.2     | GHSA-vcc3-ghjq-m6fr / CVE-2026-45822 | 2026-08-31 | moderate | `<= 0.4.2` → `0.5.0`                | `expo-router → query-string@7.1.3 → decode-uri-component@0.2.2`                                                                                                                        | runtime deep-link parsing      |
| `diff`                 | 7.0.0     | GHSA-73rr-hh4g-fpgx / CVE-2026-24001 | 2026-01-14 | low      | `6.0.0–8.0.2` → `8.0.3`             | `eas-cli → diff@7.0.0`                                                                                                                                                                 | dev/build-time only            |
| `ts-deepmerge`         | 6.2.0     | GHSA-87mf-gv2c-c62c / CVE-2026-12644 | 2026-06-19 | moderate | `< 8.0.0` → `8.0.0`                 | `eas-cli → ts-deepmerge@6.2.0`                                                                                                                                                         | dev/build-time only            |

The remaining audit package entries are wrappers for these five advisories:

- `@expo/cli` (via `node-forge` and `zod`), `expo` (via `@expo/cli`)
- `@expo/code-signing-certificates`, `@expo/pkcs12`, `jks-js` (via `node-forge`)
- `eas-cli` (via `node-forge`, `diff`, `ts-deepmerge`, and the two code-signing packages)
- `query-string`, `expo-router` (via `decode-uri-component`)

### C.2 Transitive findings remediated in this change

All versions below are the installed versions before → after. “Path” is the dependency route; the
same package may appear in several tool trees, but the patched version is deduped.

| Package           | Before → after                                 | Advisory / CVE                                                                                                                                                                                                                                                                                                        | Severity             | Path                                                                                                | Remediation                                                |
| ----------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `brace-expansion` | 1.1.18 → 1.1.21; 2.1.4 → 2.1.7; 5.0.9 → 5.0.12 | GHSA-q2hr-2g5m-vwhr / CVE-2026-102277; GHSA-qhr7-859c-m2p7 / CVE-2026-102278; GHSA-6j4f-fj2g-mc7p / CVE-2026-102276                                                                                                                                                                                                   | medium / high / high | ESLint, Jest, `glob`, `filelist`, `sucrase`, `test-exclude`                                         | `npm update` (all three majors patched)                    |
| `shell-quote`     | 1.10.0 → 1.12.0                                | GHSA-pqg4-j6r4-53mv / CVE-2026-102422                                                                                                                                                                                                                                                                                 | critical             | `react-native → react-devtools-core → shell-quote`                                                  | `npm update`                                               |
| `source-map-js`   | 1.2.1 → 1.2.2                                  | GHSA-68fv-2mgg-jv7q / CVE-2026-93749                                                                                                                                                                                                                                                                                  | high                 | `expo → @expo/cli → @expo/metro-config → postcss → source-map-js`                                   | `npm update`                                               |
| `fast-uri`        | 3.1.6 → 3.1.9                                  | GHSA-qw65-cvwx-89v3, GHSA-58mr-gqgx-xq4g, GHSA-hrr3-gc8f-f4qj, GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp (CVE-2026-84292, -84394, -86472, -110306, -110095, -110180, -110725)                                                                                                | high / medium / low  | `eas-cli → ajv@8 → fast-uri`                                                                        | `npm update` + `ajv@8` override                            |
| `joi`             | 17.11.0 / 17.13.6 → 17.13.8                    | GHSA-q7cg-457f-vx79 (CVE-2026-48038), GHSA-6w3j-5fw6-r9vr (CVE-2026-84368), GHSA-gg4h-3hg2-grpc (CVE-2026-84367), GHSA-wr44-6hxh-3jwq (CVE-2026-90771), GHSA-6h2x-m376-mqjq (CVE-2026-92599)                                                                                                                          | high / medium / low  | `eas-cli → @expo/eas-json`, `@expo/eas-build-job`, `@expo/steps → joi`                              | override `joi@17: 17.13.8`                                 |
| `js-yaml`         | 3.15.1 → 3.15.2; 4.3.1 → 4.3.2                 | GHSA-2883-xcg3-v3hh / CVE-2026-84375                                                                                                                                                                                                                                                                                  | high                 | `eas-cli → @oclif/core`; `eslint → @eslint/eslintrc`; `@expo/cli → @expo/xcpretty`                  | `npm update`                                               |
| `minimatch`       | 5.1.2 → 5.1.8                                  | GHSA-3ppc-4f35-3m26 (CVE-2026-26996), GHSA-7r86-cg39-jmmj (CVE-2026-27903), GHSA-23c5-xmqv-rm74 (CVE-2026-27904)                                                                                                                                                                                                      | high                 | `eas-cli → filelist → minimatch@5`                                                                  | override `minimatch@5: 5.1.8`                              |
| `moment`          | 2.30.1 → 2.31.0                                | GHSA-4p3w-j4w9-5jqw / CVE-2026-17495                                                                                                                                                                                                                                                                                  | moderate             | `eas-cli → @expo/logger → bunyan → moment`                                                          | `npm update`                                               |
| `nanoid`          | 3.3.8 → 3.3.18                                 | GHSA-28wg-ghj8-5hjv (CVE-2026-67214), GHSA-2v37-7h3g-55p8 (CVE-2026-67213), GHSA-xwg4-73v4-xw9w (CVE-2026-73086)                                                                                                                                                                                                      | high                 | `eas-cli → nanoid`; `expo-router → postcss → nanoid`                                                | override `nanoid@3: 3.3.18`                                |
| `tar`             | 7.5.19 → 7.5.21                                | GHSA-r292-9mhp-454m / CVE-2026-73566                                                                                                                                                                                                                                                                                  | high                 | `eas-cli → tar`                                                                                     | override `tar: 7.5.21`                                     |
| `yaml`            | 2.6.0 → 2.8.3                                  | GHSA-48c2-rrv3-qjmp / CVE-2026-33532                                                                                                                                                                                                                                                                                  | moderate             | `eas-cli → yaml`; `@expo/steps → yaml`; `expo → @expo/metro → metro-config → yaml`                  | override `yaml@<2.8.3: 2.8.3`                              |
| `ajv`             | 8.11.0 → 8.18.0                                | GHSA-2g4f-4pwh-qvx6 / CVE-2025-69873                                                                                                                                                                                                                                                                                  | moderate             | `eas-cli → ajv@8`; also used by `@hookform/resolvers`/`ajv-formats`                                 | override `ajv@8: 8.18.0`                                   |
| `@xmldom/xmldom`  | 0.8.15 / 0.9.10 → 0.8.15 / 0.9.12              | 13 advisories: GHSA-6gmq-8vp8-gcm6, GHSA-6mj3-qw4j-hgrw, GHSA-g53g-w8rj-fmg7, GHSA-w2rr-34g9-rvrj, GHSA-4w3w-2rp5-g8jm, GHSA-c7q8-3ch8-vqpv, GHSA-27p8-2357-5qqv, GHSA-3px3-54cx-rmw9, GHSA-vr34-hp96-76pp, GHSA-6h8r-xr42-gp59, GHSA-8344-3jmq-59r6, GHSA-965w-775f-mr7g, GHSA-93r5-fhx6-vmg9 (CVE-2026-83605–83618) | high / medium        | `expo → @expo/plist`; `eas-cli → @expo/config-plugins → @expo/plist`; `plist`                       | `npm update` (`0.9.12`); `0.8.15` copy was already patched |
| `uuid`            | 7.0.3 / 8.3.2 / 9.0.1 → 11.1.1                 | GHSA-w5hq-g745-h8pq / CVE-2026-41907                                                                                                                                                                                                                                                                                  | moderate             | `eas-cli → xcode@3.0.1`; `eas-cli → @expo/bunyan`; `@expo/rudder-sdk-node`; `mixpanel-react-native` | scoped `uuid` override to 11.1.1                           |

`npm audit fix` (without `--force`) reported “up to date” and made no changes. It did not resolve
the `tar` entry even though npm advertised a non-breaking fix; the explicit `tar: 7.5.21` override
was required.

### C.3 Overrides in `package.json`

```json
"overrides": {
  "ajv@8": "8.18.0",
  "joi@17": "17.13.8",
  "minimatch@5": "5.1.8",
  "mixpanel-react-native": { "uuid": "11.1.1" },
  "nanoid@3": "3.3.18",
  "tar": "7.5.21",
  "uuid@<11.1.1": "11.1.1",
  "xcode": { "uuid": "11.1.1" },
  "yaml@<2.8.3": "2.8.3"
}
```

The nested `mixpanel-react-native` and `xcode` entries are needed because npm 10 did not
consistently apply the range-keyed `uuid` override to those two parents; they keep the final tree
stable across `npm install` and `npm ci`. No override changes a package's major version except
`uuid` (7/8/9 → 11.1.1), which is explicitly required and is verified by the Expo config/export
gates.

## D. Removed dependencies

No direct dependency was removed. npm's lockfile recalculation/dedupe removed duplicate nested
copies, most notably the four vulnerable `uuid` copies (7.0.3, 8.3.2 ×2, 9.0.1), which are now one
deduped `uuid@11.1.1`. No application feature or direct package was dropped.

## E. Residual vulnerabilities and exceptions

The final audit has **13 package entries** but only **five unique advisories**. The extra entries
are parents that inherit a child finding. Every remaining finding is listed below; none is hidden.

### E.1 `node-forge@1.4.0` — high — no patched release

- Advisory: GHSA-86w9-cpqp-85rv / CVE-2026-85393 (published 2026-09-03).
- Paths: `expo → @expo/cli → node-forge`; `expo → @expo/cli →
@expo/code-signing-certificates → node-forge`; `eas-cli → @expo/code-signing-certificates`,
  `@expo/pkcs12`, `jks-js → node-forge`.
- Why it remains: 1.4.0 is the latest published release and the advisory lists no patched version.
  Forcing a fork would be inventing a package, which the brief forbids.
- Exposure: build-time code signing, PKCS#12/JKS handling, and Expo CLI certificate tooling. These
  paths are not imported by the app bundle. The only prod-audit presence is because `expo` is a
  production dependency that contains `@expo/cli`.
- Compensating factors: build tooling runs on developer/CI machines against trusted project
  material, not on attacker-controlled app input; no prebuild/code-signing command is run as part
  of the app at runtime. Re-check when upstream publishes a patched 1.x.

### E.2 `zod@3.25.76` under `@expo/cli` — high — build-time-only residual

- Advisory: GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 (published 2026-10-01).
- Path: `expo → @expo/cli → zod@3.25.76`.
- Why it remains: `@expo/cli` requires the 3.x API; overriding it to 4.6.6 would break the CLI.
  There is no patched 3.x release. The direct app `zod` is 4.6.7 and is remediated.
- Exposure: Expo CLI configuration/manifest validation at build/dev time. It is not bundled into
  the app.
- Compensating factors: no untrusted runtime data reaches this copy; the app's own validation uses
  patched `zod@4.6.7`.

### E.3 `decode-uri-component@0.2.2` via `expo-router` — moderate — runtime residual

- Advisory: GHSA-vcc3-ghjq-m6fr / CVE-2026-45822 (published 2026-08-31).
- Path: `expo-router@57.0.29 → query-string@7.1.3 → decode-uri-component@0.2.2`.
- Why it remains: the patched release is 0.5.0, which is ESM-only; `query-string@7` is CommonJS.
  Overriding it would break deep-link query parsing. Upgrading `expo-router` to the fixed 58.x line
  is a major SDK change and is out of scope for this patch-level alignment.
- Exposure: malformed percent-encoded deep-link input can cause exponential decoding and CPU
  exhaustion during URL parsing. The input must be supplied through a link/notification, and the
  app can be restarted.
- Compensating factors: deep-link parsing happens on cold start/notification routing rather than in
  a long-lived request loop; OS URL length limits bound the practical payload; no credentials are
  exposed by a CPU-only denial of service.

### E.4 `diff@7.0.0` via `eas-cli` — low — dev/build-only residual

- Advisory: GHSA-73rr-hh4g-fpgx / CVE-2026-24001 (published 2026-01-14).
- Path: `eas-cli@23.2.0 → diff@7.0.0`.
- Why it remains: the patched version is 8.0.3, a major upgrade. EAS CLI is dev-only; forcing the
  major could break the build tool. The brief explicitly says not to override `diff` 7 → 8.
- Exposure: `parsePatch`/`applyPatch` denial of service in the EAS CLI. Not shipped in the app.

### E.5 `ts-deepmerge@6.2.0` via `eas-cli` — moderate — dev/build-only residual

- Advisory: GHSA-87mf-gv2c-c62c / CVE-2026-12644 (published 2026-06-19).
- Path: `eas-cli@23.2.0 → ts-deepmerge@6.2.0`.
- Why it remains: patched only in 8.0.0 (major). The brief explicitly says not to override 6 → 8.
- Exposure: prototype-method override denial of service in EAS config merging. Build tooling only.

### E.6 Expected audit wrappers

The following audit entries are not independent vulnerabilities; they inherit the five advisories
above: `@expo/cli`, `expo`, `@expo/code-signing-certificates`, `@expo/pkcs12`, `jks-js`,
`eas-cli`, `query-string`, and `expo-router`. Removing a child would remove the corresponding
parent entry.

### E.7 Deliberate non-remediations

- `diff` 7 → 8: not overridden (major, dev-only; documented in E.4).
- `ts-deepmerge` 6 → 8: not overridden (major, dev-only; documented in E.5).
- `zod` 3.25.76 → 4.x under `@expo/cli`: not overridden (API-major, build-time; E.2).
- `decode-uri-component` → 0.5.x: not overridden (ESM-only against CJS query-string; E.3).
- `node-forge`: no patched release (E.1).

## F. Before/after verification evidence

### Baseline (captured before changes)

| Check                    | Result                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `npm audit`              | 35 findings: 1 critical, 17 high, 16 moderate, 1 low                                         |
| `npm audit --omit=dev`   | 16 findings: 1 critical, 8 high, 7 moderate                                                  |
| `npm run lint`           | pass (baseline log)                                                                          |
| `npm run typecheck`      | pass (baseline log)                                                                          |
| `npx prettier --check .` | fail: 55 files (53 tracked source files + the 2 untracked baseline audit JSON scratch files) |

Baseline audit unique GHSAs: 47 across 35 package entries. Baseline prod audit: 22 unique GHSAs
across 16 entries.

### After (final tree)

| Command                                                        | Result                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --version`                                               | `v22.23.4`                                                                                                                                                                                                                                                                                                                                               |
| `npm --version`                                                | `10.9.9`                                                                                                                                                                                                                                                                                                                                                 |
| `npm ls --all`                                                 | exit 1; tree renders, with pre-existing peer warnings: `@react-native/metro-config` is a declared peer of `react-native-worklets@0.10.1` but was already absent from the baseline lockfile, and `typescript@6.0.3` is outside `@expo/require-utils`'s `^5` range (unchanged repo pin). Neither is used by the Expo export path. No `uuid` invalid entry. |
| `npm ls uuid --all`                                            | exit 0; all copies deduped to `uuid@11.1.1`                                                                                                                                                                                                                                                                                                              |
| `npm audit --json`                                             | 13 findings: 0 critical, 8 high, 4 moderate, 1 low (unique GHSAs: 5)                                                                                                                                                                                                                                                                                     |
| `npm audit --omit=dev --json`                                  | 8 findings: 0 critical, 5 high, 3 moderate (unique GHSAs: 3)                                                                                                                                                                                                                                                                                             |
| `npm audit --audit-level=moderate`                             | exit 1; 13 findings (1 low, 4 moderate, 8 high), as expected while residuals remain                                                                                                                                                                                                                                                                      |
| `npm ci`                                                       | pass (exit 0); 1,504 packages installed; reproduced 13 findings                                                                                                                                                                                                                                                                                          |
| `npm run lint`                                                 | pass (exit 0)                                                                                                                                                                                                                                                                                                                                            |
| `npm run typecheck`                                            | pass (exit 0)                                                                                                                                                                                                                                                                                                                                            |
| `npm test -- --ci`                                             | pass: 87 suites / 1,076 tests / 0 snapshots                                                                                                                                                                                                                                                                                                              |
| `npm run verify`                                               | pass (exit 0): typecheck + lint + 87 suites / 1,076 tests                                                                                                                                                                                                                                                                                                |
| `npx expo config --type public`                                | pass; config resolves with the uuid override                                                                                                                                                                                                                                                                                                             |
| `npx expo export --platform android --output-dir dist-verify`  | pass (exit 0); 2,649 modules bundled; 7.6 MB Android Hermes bundle; `dist-verify` deleted afterwards                                                                                                                                                                                                                                                     |
| `npx expo install --check`                                     | `Dependencies are up to date`                                                                                                                                                                                                                                                                                                                            |
| `npx prettier --check package.json eas.json package-lock.json` | pass: “All matched files use Prettier code style!”                                                                                                                                                                                                                                                                                                       |
| `npx prettier --check SECURITY_UPGRADES_2026-10.md`            | pass                                                                                                                                                                                                                                                                                                                                                     |
| `npx prettier --check .`                                       | fail: 53 tracked files; the 55 baseline total included 2 untracked audit JSON scratch files removed before commit. Same tracked set as before; no changed file fails.                                                                                                                                                                                    |
| `npx prettier --check .nvmrc .node-version`                    | not applicable: Prettier cannot infer a parser for version-only dotfiles; both contain exactly `22.23.4` + LF                                                                                                                                                                                                                                            |
| `npm run build`                                                | script does not exist; `npx expo export` is the build equivalent and passed                                                                                                                                                                                                                                                                              |
| `npm run format:check`                                         | script does not exist; `npx prettier --check .` is the equivalent and has the same 53 tracked pre-existing failures                                                                                                                                                                                                                                      |

### Before/after summary

| Metric                       | Before | After  | Change    |
| ---------------------------- | ------ | ------ | --------- |
| `npm audit` total            | 35     | **13** | −22 (63%) |
| critical                     | 1      | **0**  | −1        |
| high                         | 17     | **8**  | −9        |
| moderate                     | 16     | **4**  | −12       |
| low                          | 1      | **1**  | 0         |
| `npm audit --omit=dev` total | 16     | **8**  | −8 (50%)  |
| prod critical                | 1      | **0**  | −1        |
| prod high                    | 8      | **5**  | −3        |
| prod moderate                | 7      | **3**  | −4        |

The count is strictly below the baseline. All 13 remaining entries map to the five unique
advisories in section E; the critical `shell-quote` finding and all directly reachable runtime
`uuid`/`zod` findings are gone.

### Reviewer checks

- `npm ls --all` is not a clean exit because of two pre-existing peer conditions that this change
  did not introduce: `react-native-worklets@0.10.1` expects optional `@react-native/metro-config`
  (never present in the baseline lockfile), and `typescript@6.0.3` is outside
  `@expo/require-utils`'s `^5` peer range. The changed `uuid` tree is clean (`npm ls uuid --all`
  exits 0).
- The `uuid` override is a major-range override (7/8/9 → 11.1.1), explicitly required by the brief.
  Verify runtime analytics (Mixpanel) and any EAS local code-signing flow on a real build. The JS
  export and Expo config gates pass locally; Python/native signing paths are not exercised by
  `expo export`.
- `node-forge` and the `@expo/cli` `zod` copy are build-time residuals with no patched same-major
  release. They remain visible in `--omit=dev` because `expo` is a production dependency.
- `decode-uri-component` is the only remaining runtime-reachable residual; it requires a malformed
  deep link to trigger a CPU denial of service.
- Prettier still reports the 53 tracked files that also failed in the baseline (the baseline total of
  55 included two untracked audit JSON scratch files). No unrelated file was reformatted.

### Production re-verification

Branch `chore/security-upgrades-2026-10-prod` (base `31a3e54`) is a cherry-pick of staging commit
`acc82a3`. From a clean `npm ci` with Node `v22.23.4`, these all passed: lint, typecheck, changed-file
Prettier, tests (87 suites / 1,076 tests), `npx expo install --check`,
`npx expo config --type public`, Android export (2,649 modules, 7.6 MB Hermes bundle), and
`npm run verify`. `npm ls uuid --all` is clean; `npm ls --all` exits 1 on the same two pre-existing
peer conditions documented above. `npm audit` reproduced 13 findings and `npm audit --omit=dev`
reproduced 8 findings, identical to staging.
