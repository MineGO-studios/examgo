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

## Record verification

State the revision or file hashes, environment, input, command, result and limits. Report failed, skipped and not-run checks separately. Local source, mocked browser checks, real database authorization, hosted behavior, document packages and human visual acceptance prove different boundaries.

Never infer a passing hosted workflow from a local build. Never infer Word pagination from package inspection. The project's document-render permission boundary still applies.

## Finish a substantial change

Update affected guides/reference and the changelog. Record the product version and exact evidence in a [change record](../templates/change-record.md). Follow the [documentation/versioning policy](../maintenance/documentation-and-versioning.md) before presenting a feature or phase as complete.

Commits, tags, pushes, deployments, migrations and Production writes need their existing authorization. Changing package metadata does not publish a release.
