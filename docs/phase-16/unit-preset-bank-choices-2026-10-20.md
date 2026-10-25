# Unit preset bank choices — 20 October 2026

Owner requested Unit 1, Unit 2, Unit 3 and Unit 4 preset banks beside Mid-Year Prototype (Preset). Four unit-specific read-only choices now appear in Active bank. They reference the existing published source and canonical identities; no question copies, database rows, grants or migrations were added. Combined preset retains every original question and group.

The selected unit scopes the bank header total, unit overview, search/type/context filters and question list. Published groups touching that unit remain available with their full original context in Passages, including cross-unit context. Multiple source banks receive disambiguated unit labels. Personal banks retain authoring. Existing paper-generation limits remain unchanged.

Changed this task: src/lib/presetBankViews.ts and five tests; QuestionEditor integration; a scoped ChoiceChips maxInlineOptions prop and two tests; shared-bank E2E scenarios; primary teacher guide and Unreleased changelog. Active bank permits six visible choices, while the existing default five-choice cutoff remains unchanged everywhere else. Larger bank lists continue using the native select. Existing styling, keyboard behavior and wrapping are reused.

## Exact artifact

- Worktree C:/Users/hlmm8/Dev/.worktrees/shared-preset-banks/examgo; detached base acb585fbf366fdbad18249f9b41edd85f1c414d1. This task and previous shared-bank implementation remain uncommitted. Original and UI worktrees preserved; no commit, push or PR.
- Source manifest SHA-256 09aed71b977721c4dd4c36733d048c45c0cfc0f67a70cdb51c800d9a94fb8858; primary output/phase16/unit-presets-evidence/source-manifest.json. Artifact package metadata remains inherited 0.0.0; primary owner checkpoint remains 1.0.0-alpha.1. No metadata change or new release/checkpoint claimed.
- Preview 52b2d154-717e-43db-832f-d6b41c22d2d9; Cloudflare success 2026-10-20T19:10:24.835385Z (22:10:24 Asia/Baghdad). Exact https://52b2d154.examgo.pages.dev/; alias https://ui-ux-refresh.examgo.pages.dev/. Metadata branch ui-ux-refresh, parent acb585f, commit_dirty=true.
- Main bundle index-Bn-YHVyb.js. All 60 public assets, stable alias and six security headers verified against exact build. Eight approved DOCX template bytes unchanged. No document rendering.

## Verification and limits

- App tests: 590 passed, 6 skipped; 82 files passed, 4 skipped. Log output/phase16/unit-presets-tests.log. Seven new tests cover choice identities/labels, unit scoping, full linked context, combined-bank preservation and default/scoped selector layout.
- Application and E2E TypeScript passed. Lint passed with only the inherited unused bankRecord warning at verify-preset-intake-candidates-local-db.mjs:111. Build and git diff --check passed. Log output/phase16/unit-presets-build.log.
- In-app browser against local synthetic backend: all six choices visible together; each of Unit 1–4 shows its own two records and excludes another unit; switching to combined preset restores Units 1 and 4. Fixture unhandled requests empty. Screenshot output/phase16/unit-presets-evidence/unit-preset-selector.png uses sample data, not live question counts.
- New hosted Preview sign-in page loaded. Existing signed-in user tabs were not changed. New-host authenticated UI and standalone Playwright suite were not exercised; native Chromium previously failed to launch. E2E test source was updated and typechecked, not claimed passed.
- No database/security contract changed; earlier 12-check disposable database and hosted access evidence remains recorded in active-bank-preset-integration-2026-10-20.md at its original scope. No new live future account or teacher acceptance claimed.
- Primary official guide and Unreleased changelog updated narrowly. No future version or phase promotion. Phase 16 observation remains pending; Phase 17 not started. Production unchanged.

Brain session proposal is unsaved because the shared vault is outside writable scope. No new reusable lesson beyond established shared-source and complete-group rules was identified.

Skills used: minego-brain, caveman, ponytail, frontend-design, verify-and-stop, built-in-browser.
