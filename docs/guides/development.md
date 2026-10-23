# Development setup and verification

Applies to: `1.0.0-alpha.1`

Last reviewed: 20 October 2026

## Start locally

Follow the [repository quick start](../../README.md#local-development). CI currently uses Node.js 24. Use the lockfile with `npm ci`; do not upgrade dependencies as part of an unrelated task.

`.env.example` defines two browser configuration values: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Obtain them for the authorized environment. Do not place service-role credentials, database passwords or private data in frontend variables.

Database setup is a separate authorized operation. Do not apply every historical migration or rollback against an existing project as a quick-start step.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local Vite development |
| `npm test` | Application tests and script tests |
| `npm run lint` | Configured static checks |
| `npm run build` | TypeScript and production bundle |
| `npm run typecheck:e2e` | Browser-test TypeScript compilation |
| `npm run test:e2e` | Configured browser tests |
| `npm run preview` | Serve the locally built bundle |

Use [the quality workflow](../../.github/workflows/quality.yml) for the current CI sequence. Consult each database verifier before running it; use disposable authorized targets. A script's name does not prove that it cannot affect persistent data.

## Interface languages

The interface is available in English and Arabic. Paper content stays in its source language.

- **Screen strings:** each screen keeps its strings in a sibling `*.strings.ts` file built with `defineStrings` from `src/lib/localize.ts`. English sets the shape, and a missing Arabic entry fails the typecheck.
- **Completeness:** `src/lib/strings.completeness.test.ts` finds every `*.strings.ts` file and fails on an empty, untranslated or Eastern-digit Arabic entry.
- **Counts:** `plural(language, count, forms)` chooses the grammatical form. Arabic has six forms (zero, one, two, few for 3–10, many for 11–99, and other); give at least `other`.
- **Numbers and dates:** use `formatNumber` and `formatDate`. Arabic uses Iraqi month names with Western digits (`ar-IQ-u-nu-latn`).
- **Application messages:** repositories write their messages in English. `localizeAppMessage` in `src/lib/appMessages.ts` translates them where they are displayed, and keeps any support reference code unchanged. A message missing from its catalog is shown in English, never half-translated.
- **Right to left:** use logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`). Wrap names, emails, references and other data in `<bdi>`; mark English paper content `dir="ltr" lang="en"`. Paper sheets opt out of the Arabic alignment rule in `src/index.css`.
- **Sweep:** `e2e/local-arabic-rtl-sweep.spec.ts` visits every teacher and reviewer screen in Arabic at 320, 390 and 1280px, light and dark, with reduced motion. It checks overflow, leftover English (header included), axe and header focus order, and writes screenshots to `output/rtl-audit/`. Add a new screen to it.
- **Review:** a native-speaking Iraqi teacher reviews the Arabic before release ([MIN-274](https://linear.app/minego/issue/MIN-274)).

## Record verification

State the revision or file hashes, environment, input, command, result and limits. Report failed, skipped and not-run checks separately. Local source, mocked browser checks, real database authorization, hosted behavior, document packages and human visual acceptance prove different boundaries.

Never infer a passing hosted workflow from a local build. Never infer Word pagination from package inspection. The project's document-render permission boundary still applies.

## Finish a substantial change

Update affected guides/reference and the changelog. Record the product version and exact evidence in a [change record](../templates/change-record.md). Follow the [documentation/versioning policy](../maintenance/documentation-and-versioning.md) before presenting a feature or phase as complete.

Commits, tags, pushes, deployments, migrations and Production writes need their existing authorization. Changing package metadata does not publish a release.
