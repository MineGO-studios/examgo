# Active bank preset integration — 20 October 2026

Owner correction: preset banks must appear beside personal banks in the existing Active bank control, using the same unit overview, filters and list. Owner confirmed they are signed in; authentication troubleshooting is outside this correction.

## Delivered behavior

Personal and published preset banks share Active bank. Preset labels end in (Preset). Both use the same extracted QuestionBankBrowser component: complete unit totals, unit selection, search, type/context filters, 25-row paging and existing question cards. Shared content is read-only; Add/Edit and import/bank management are unavailable. Passages displays published text, original instructions and ordered member prompts. Switching to a personal bank restores authoring. Existing generation and educational eligibility limits remain unchanged.

The previous separate catalogue implementation and its record remain historical. This correction supersedes that UI behavior; it does not rewrite the prior verification scope. PresetBanks.tsx from the earlier uncommitted implementation was removed after verifying its only caller was replaced.

## Artifact and environment

- Task worktree: C:/Users/hlmm8/Dev/.worktrees/shared-preset-banks/examgo; detached base acb585fbf366fdbad18249f9b41edd85f1c414d1; implementation remains uncommitted. The UI base and original worktree were preserved. No new commit, push or PR.
- Source manifest SHA-256: 72b8764f5f52f80ea569ea74ff677c83706eb47dcb2fb354f13cd741477bfdeb; file hashes: primary output/phase16/integrated-presets-evidence/source-manifest.json.
- Inherited task artifact package version: 0.0.0. Primary checkout has owner-established 1.0.0-alpha.1 documentation work. No metadata synchronization or new product version was performed; this is an Unreleased task, not a new accepted checkpoint.
- Development: existing ExamGO project ltwflpvvwadyfqctqumy. Additive migration 20261020180600_phase16_preset_bank_browser installed and read back. Original 20261020163754 shared-bank functions remain compatible with older Preview clients. New matching migration/rollback source is recorded locally.
- New projection get_preset_bank_browser: authenticated only, stable security definer, empty search_path, 1–500 question records per page. Allowlists public card answers/options and complete eligible passage/group context. No source ownership, raw source content or private notes are projected. Existing table RLS/grants and publication rules are unchanged.
- Cloudflare Preview: 4059919c-b6ab-49cb-a22f-749e0ed998af; success 2026-10-20T18:08:45.561176Z. Exact https://4059919c.examgo.pages.dev/; stable https://ui-ux-refresh.examgo.pages.dev/. Branch metadata ui-ux-refresh, base acb585f, commit_dirty=true. Production branch remains main and was not deployed.
- Hosted artifact main bundle: index-q4kVXgoJ.js. All 60 public assets matched exact build SHA-256 values. Stable alias and six security headers verified. Eight DOCX template bytes unchanged; no rendering occurred.

## Verification

- App regression: 583 passed, 6 skipped; 80 files passed, 4 skipped. Logs: output/phase16/integrated-presets-final-unit.log.
- Application TypeScript and E2E TypeScript passed. Lint passed with one inherited unused bankRecord warning in verify-preset-intake-candidates-local-db.mjs:111. Production-mode real-backend build passed; no synthetic backend was deployed.
- Disposable PostgreSQL: all 55 earlier migrations compiled, all 12 integrated-browser checks passed, including future-account access, public projection privacy, whole-group eligibility, owner RLS, cursor paging/version detection, withdrawal/archive, rollback/reinstall. Log: output/phase16/integrated-presets-final-db.log. These local rollback/future-account checks do not establish hosted rollback or a real future signup.
- Live Development: two ordinary accounts receive 500-row public pages; authenticated-only execution and absent private fields verified. Every live published bank loaded through all cursor pages with stable versions and client-compatible prompt/lesson/external identity/unit/difficulty/attempt fields. Published counts match complete page totals. Current eligible unit counts previously read back: 528, 465, 543 and 57 (1593 total), subject to future publication changes.
- Actual in-app browser against local synthetic backend: personal/preset choices appear together; all four unit bars, combined unit/search filtering, published passage expansion and personal authoring restoration exercised. Synthetic fixture reported no unhandled requests. Screenshot: output/phase16/integrated-presets-evidence/synthetic-selector.png; sample counts are not live catalogue counts.
- Standalone Playwright suite was not completed: native Chromium launch remains unavailable with spawn UNKNOWN. The app-browser checks above exercise the current UI but do not substitute for the full suite or claim its accessibility checks passed.
- New hosted Preview sign-in page loaded. Existing signed-in user tab and its session were left untouched; no credential/session extraction or copying occurred. Hosted authenticated selector interaction on the new immutable origin remains unexercised.
- Focused diff review and git diff --check passed; normal LF/CRLF notices only.

## Relevant correction and documentation

Attempt counts can describe points/blanks inside one completion record. Fifty-two source branches had attempted points greater than their question-record count. Client validation now accepts positive attempted points independently of member count, and the read-only summary omits an invented Answer X of N statement. A regression test covers five blanks in one record.

Primary official teacher guide and Unreleased changelog received narrow selector behavior updates. No rendering, scoring, import or paper finalization contracts changed, so their manuals/templates need no rewrite. No phase completion or product version promotion is claimed.

Automatic approval review rejected an attempted package-version sync and broad documentation copy into the task worktree as outside this UI scope. That script did not run. The blocked changes remain unapplied; only the relevant existing guide and change notes were updated.

Phase 16 teacher observation remains pending. Phase 17 was not started. No tracker status changes, Production writes, content publication or account creation.

Brain is readable but outside writable scope. A sanitized unsaved session proposal accompanies this record; no shared-vault or system-memory write was performed.
