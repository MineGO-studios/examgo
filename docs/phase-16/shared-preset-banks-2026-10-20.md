# Shared preset banks — 20 October 2026

Owner requested all preset banks be available to all current and future users. Implementation and activation are limited to signed-in teacher access to published eligible presets in Development and Preview. Phase 17 and Production remain untouched.

## Result

Question banks now includes a shared read-only Preset banks catalogue, with a bank selector, literal prompt/lesson search, cursor pagination, explicit retry states and a Create from approved presets action. It loads independently of personal banks, including accounts with no personal bank. Both current and future authenticated accounts receive the same access without per-user assignments or copies. Newly eligible published banks appear automatically. Bank names and published question catalogue fields are projected explicitly; source rows, ownership IDs, private notes, unpublished revisions and incomplete groups remain protected.

Paper creation continues through the existing approved-preset formats. This change does not add shared banks to private-bank composition selectors, expose every format/unit to generation, or permit editing the official source. The catalogue lists prompts and metadata; full exercise instructions and answer review remain in the existing complete-preset paper workflow. Existing renderer and publication constraints remain in force.

## Source and live activation

- Managed worktree: C:/Users/hlmm8/Dev/.worktrees/shared-preset-banks/examgo, detached at base acb585fbf366fdbad18249f9b41edd85f1c414d1. Changes remain uncommitted. Main checkout and the ui-ux-refresh worktree were preserved.
- Changed source: App/QuestionEditor integration, PresetBanks.tsx, presetBankRepository.ts and tests, database types, three browser regression cases and fixture defaults, migration/rollback and disposable database verifier.
- Source manifest SHA-256: b987385ba5383e974f00aa7ec560fd7d5e682286e99b7a3cde0b5b07fcfe7e8b. Full file hashes are in output/phase16/shared-presets-evidence/source-manifest.json in the primary checkout.
- Development migration installed: 20261020163754_phase16_shared_preset_banks. Local matching migration and rollback files are recorded under supabase/migrations and supabase/rollback. Adds two authenticated read functions and one non-callable internal helper. No existing table grants, RLS policies, content rows or saved papers were changed.
- Preview deployment: a62136e3-4d56-43c7-85f1-b9b197f0eb95. Cloudflare success: 2026-10-20T16:41:07.54623Z, 19:41:07 Asia/Baghdad.
- Exact Preview: https://a62136e3.examgo.pages.dev. Stable alias: https://ui-ux-refresh.examgo.pages.dev.
- Deployment metadata names base acb585f and commit_dirty=true. It is the uncommitted source manifest above, not a claim that acb585f contains this feature. Preview alias metadata remains ui-ux-refresh to update the existing teacher Preview link.
- Previous immutable UI Preview https://28efd6ab.examgo.pages.dev remains available. Additive database changes preserve old clients. Rollback removes only the three new functions; revert Preview separately if needed. Rollback was rehearsed locally, not against the hosted service.

## Verification and limits

- 576 application tests passed, 6 skipped; 79 test files passed, 4 skipped.
- Lint passed with one pre-existing unused bankRecord warning in verify-preset-intake-candidates-local-db.mjs; no new component warnings remain.
- Application TypeScript/build and E2E type checks passed. Initial build lacked VITE configuration in the isolated checkout; explicit synthetic settings passed, followed by the final build using the existing real backend and only a public browser key.
- Disposable PostgreSQL: 54 prior migrations replayed and 10 new checks passed. Covers existing and subsequently created accounts, future bank publication, pagination/search, signed-out/anonymous denial, exact projection fields, private-table and write isolation, withdrawal/archive, equality with protected whole-group eligibility and rollback/reinstall.
- Initial local replay hit a known CRLF-sensitive historical preflight; the harness now normalizes migration text to LF. No historical migration was edited.
- Hosted readback under authenticated roles for two existing ordinary accounts passed: shared bank catalogue and 50-row question page visible; publisher-private bank row hidden. No accounts, invitations or participant records were created. Future-account behavior was demonstrated in disposable PostgreSQL, not with a fabricated live signup.
- Live catalogue source contains 1,605 publication records; 1,593 currently pass unchanged current-revision and whole-group eligibility. Missing eligibility is not overridden by sharing.
- Focused read-only execution plan for the optimized catalogue on current Development data: 1,152.634 ms execution, 4.213 ms planning, one bank. The first repeated eligibility approach took approximately 13.8 seconds and was replaced. An earlier inline clock measurement of 1.866 ms excluded materialized work; it is invalid as total execution timing and must not be reused. No concurrency/load acceptance claimed.
- All eight Word template hashes unchanged. No DOCX generated or rendered.
- All 60 deployed public assets match the final build; stable alias HTTP 200 and all six security headers verified. Hosted sign-in screen loads; screenshot saved.
- Three new browser regression cases compile but were not executed: the existing Chromium launch harness remains unavailable (previous spawn UNKNOWN evidence). Authenticated browser interaction, keyboard/screen-reader behavior and automated accessibility are not claimed as passed. A real teacher session remains outstanding.

Local receipts in the primary checkout: output/phase16/shared-presets-unit.log, shared-presets-db.log, shared-presets-build.log, shared-presets-build-final.log, and shared-presets-evidence/ (build/source manifests, upload/deployed readbacks, screenshot). No commit, push, PR, tracker update or Production mutation. Phase 16 observed-use gates remain incomplete; Phase 17 not started.
