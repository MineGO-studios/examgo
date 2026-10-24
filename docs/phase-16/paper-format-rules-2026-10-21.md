# Shared paper-format checkpoint

ExamGO by MineGO Studio · 21 October 2026 (Asia/Baghdad) · current documentation checkpoint `1.0.0-alpha.1`, implementation under Unreleased.

Assessment: **VERIFIED AT LIMITED SCOPE** — renderer/content-preview implementation and production-entrypoint package checks, plus owner Word acceptance of all three exact revised fixture pairs. [MIN-267](https://linear.app/minego/issue/MIN-267) records this completed owner-requested Phase 16 support slice; parent Alpha gates remain open. The acceptance is artifact-specific, not acceptance of a new hosted application build.

## Accepted original and resulting requirement

Owner inspected the hosted saved-QA pair and reported both open and editable, one page each, with no text issues. Word version was not supplied. Exact accepted originals:

- Student: `ExamGO-Unit1-Exam (23).docx`, SHA-256 `6360fc167a61448cdaad3eff8e01c043e8dd23f9b4a9f4457c3eb3de84c9db46`.
- Key: `ExamGO-Unit1-Answer-Key (21).docx`, SHA-256 `a9394b1ae7d64174121b6042db1cb94d66fcabae3c7af21b485ef2d38f8fed76`.

The owner then requested removing individual point marks and swapping school-name/grade placement, explicitly clarifying that these are general rules for every paper from now on. The [shared format reference](../reference/paper-format-rules.md) is the maintained product contract. This is scoped permission for those output/content-preview changes, without a wider interface redesign.

## Implementation and compatibility

Candidate: `C:/Users/hlmm8/Dev/.worktrees/shared-preset-banks/examgo`, detached base `acb585fbf366fdbad18249f9b41edd85f1c414d1` plus existing uncommitted bank work and this change. Primary docs remain on `ui-ux-refresh-old-base`, HEAD `00d655e3eca7522bedd7bab096400721df403dec`. Existing dirty/untracked work is preserved.

Candidate source manifest: `output/phase16/paper-rules-2026-10-21/source-manifest.json`, SHA-256 `8aca9b6ed597e331d56dab1bce96e6654ab5dd16da8d6c13110c3f16702539bf`, 33 recorded files. It extends the earlier bank-work identity with the format changes and separately recorded quota-verifier correction; it does not identify the old deployed bundle.

- Added `paperTemplateFormat.ts`, called by all three production document entrypoints: `generateExam.ts`, `phaseNineWorkflow.ts`, `compoundWorkflow.ts`. It normalizes school/grade fields and removes simple-template question-mark annotations before filling the template. It handles split Word runs, preserves other package parts and rejects missing/ambiguous identity fields.
- Compound student projections and matching-table generation omit point suffixes for all question types. Answer-key mark allocation, merged cells, attempted totals, canonical identities and snapshots remain unchanged.
- `SimplePaperReview.tsx` and `BlueprintPaperReview.tsx` show the same header placement; the simple student sheet omits its per-question mark badge. Editor controls, teacher paper-plan metadata and answer-key marks remain available.
- Original eight template files remain byte-identical. New export presentation applies even to an older saved snapshot; existing downloads and their acceptance records remain intact. No database/schema/persistence change or compatibility-data migration.

The candidate retains inherited package metadata `0.0.0`; primary product/docs remain `1.0.0-alpha.1`. No new application checkpoint has been accepted or version promoted. Existing hosted Preview `52b2d154` retains the older presentation; no deployment occurred.

## Verification

- Full application regression: **600 passed, 6 skipped, 0 failed**. Ten new checks cover all eight template shapes, split runs, idempotence, unchanged input/other package parts, missing-header rejection and simple content-preview parity. Updated existing compound/delivery expectations preserve unequal key marks while removing student labels.
- Application and E2E TypeScript pass; production-mode build passes. Repository lint passes with the inherited unused `bankRecord` warning at `scripts/verify-preset-intake-candidates-local-db.mjs:111`. Diff check passes with normal Windows CRLF notices.
- Fifty-question generation remains within its existing ten-second test bound; focused run measured approximately 70 ms. This is local fixture timing, not a hosted capacity guarantee.
- Three fresh student/key pairs generated through the candidate's real validation/rendering functions pass package checks: simple types, fixed source-specific excerpt and synthetic complete approved-preset shape. All six headers place Grade 6 in the first slot and school in the third. Student point suffixes are absent. Existing source order, answers, section totals and key scoring assertions pass; all six packages have 18 parts.
- Build evidence records 62 assets and eight unchanged templates. ZIP processing remains lazy. New built assets differ from the deployed Preview. No browser/hosted acceptance is claimed for the revised UI or format.

New fixture pairs and exact hashes: local `output/phase16/paper-rules-2026-10-21/documents/report.json`. These fixtures exercise production functions; they are not a fresh persisted hosted workflow or real teacher content. Source/test/build evidence is isolated under `output/phase16/paper-rules-2026-10-21/`; prior receipts were preserved.

## Word acceptance and remaining Phase 16 work

Owner accepted the linked revised complete-preset pair in Word on 21 October 2026: grade/school positions correct, student point-mark labels absent, both editable and no layout issues. The response did not specify Word version or revised page counts; do not inherit the original pair's one-page counts.

| Revised pair | Human Word acceptance | Exact SHA-256 |
| --- | --- | --- |
| Complete-preset student | Accepted | `bca22499aba5f92488dbd1d5b12570a1cdc3b88da495210e2b9eee6689b70597` |
| Complete-preset key | Accepted | `8df4b471034c54e8da13ba86e56a66f664a74be4c833f23c275dc7222f3c7530` |
| Simple student | Accepted in the subsequent bundled review | `dbb0cd126c6b325a8b6caaca369fe3d1d77c55ba596dfd39c74676ad9f704c30` |
| Simple key | Accepted in the subsequent bundled review | `bb675d72afd546e996dffc1ad907c1afb6eb6baae25d19ef964904a4c4d7d857` |
| Source-specific student | Accepted in the subsequent bundled review | `b7b1ae4a31add0caa7d83313a59d2a8688dc6e01591677657719999025d34266` |
| Source-specific key | Accepted in the subsequent bundled review | `496829750e0febc193029dd7ca14674adaa72a3bd669b535541cd822ec9e03c9` |

Owner subsequently accepted the remaining simple and source-specific pairs with an overall positive response to the bundled Word review. No revised page counts or Word version were supplied; no per-file observation beyond that overall acceptance is invented.

Local receipts: `output/phase16/paper-rules-2026-10-21/word-acceptance-complete-preset-2026-10-21.json` preserves the first review, and `word-acceptance-all-pairs-2026-10-21.json` records final acceptance of the six exact revised files. All six file hashes and all 33 recorded source hashes were rechecked. The original QA acceptance remains attached to its original hashes; revised acceptance applies only to the six files above. No local or bundled document renderer was used.

MIN-267 is complete at local implementation, package and exact-artifact Word-review scope. MIN-247 and original Alpha gates remain open. Human teacher participation, two real supported briefs per teacher, independent-success evidence, final hosted-build readiness and Alpha defect closure remain unverified. The current product/docs version stays `1.0.0-alpha.1`: acceptance of these output artifacts is not a new application-build checkpoint or release promotion. This support change does not complete Phase 16 or start Phase 17.

All implementation/docs remain uncommitted. No migration, hosted content/account write, deployment, Git publication or Production action.
