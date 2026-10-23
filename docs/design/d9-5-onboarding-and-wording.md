# D9.5 — Onboarding, navigation and teacher wording

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 23 October 2026 · [MIN-257](https://linear.app/minego/issue/MIN-257)

Status: **first slice delivered for owner review**, with further proposals below. It preserves the accepted wording and bank work of MIN-44, MIN-48 and MIN-243–245.

## How it was audited

- **First use:** a new account with no banks, at 390px, using the synthetic test backend: Question banks, My papers and New paper.
- **Repeat use:** the L6 right-to-left sweep screenshots (15 screens, 3 widths, light and dark).
- **Wording:** every teacher-facing English string, reviewer tools excluded, checked for system terms.

## Delivered

| Where | Before | Now |
| --- | --- | --- |
| Question banks, no banks yet | "Create your first question bank to start adding approved questions." | Plain wording, plus a **Use a preset exam paper made by MineGO** button, so a new teacher can make a paper straight away without building a bank first |
| Question banks | A note about MineGO reviewer tools shown to every teacher | Removed; reviewers reach their tools from Settings |
| My papers, empty | Two primary buttons for the same action ("New paper" and "Create an exam") | One action, named **New paper** like everywhere else |
| Replacing a question | "…another eligible question." | "…another one that matches your choices." |
| Preset papers | "…ready from the same sealed snapshot." and "…do not alter this snapshot." | "…ready, both from this finalized paper." and "Later changes to the preset questions do not change it." |
| Import | "intake preview", "32 MiB intake limit", "private intake batch 2/3", "one shared identity… highest-tag Unit collection" | "Loading the import…", "larger than 32 MB. Choose a smaller file.", "Saving questions… part 2 of 3", and "Each question is added once, to this bank and to its unit collection." |
| Finalized paper viewer | "Layout status: needs review", "two-page exception", "verified one-page volume", "immutable" | "Check the layout before printing", "You chose to keep this paper on two pages", "short enough to fit on one page", "This paper is finalized" |

Arabic follows the same changes. Tests: a new first-use e2e; vitest 647 passed / 6 skipped; Playwright 57/57.

## Proposals for the next slice

1. **Reviewer-only controls stay out of teacher screens.** The import Diagnostics link and Settings' "Open reviewer tools" show to every teacher. Hiding them needs an account-level reviewer check, filed in ExamGO as MIN-296. The UI change follows once that check exists.
2. **Import format names. Delivered (23 October 2026):** the import screen now says "MineGO question catalogue (CSV)", "Older ExamGO choice questions (CSV)" and "ExamGO question file (JSON)", in English and Arabic.
3. **Development-only starts. Already met:** the complete-paper candidate and structured paper starts exist only in development builds (`import.meta.env.DEV`) and appear under their own development group, so hosted builds never show them.
4. **First paper guidance.** Once D8.1 is wired, a new teacher's first New paper opens on the Exam layout template with a one-line hint ("Change any part, or start from a short test"). There is no tour.

Measure confusion and requests for help in the Phase 16 sessions, not click counts.
