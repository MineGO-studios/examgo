# Changelog

Notable ExamGO changes are recorded here. Version labels identify development checkpoints until explicitly published as releases.

## Unreleased

### Documentation

- Set teacher-trial feedback and received-paper-copy retention to the owner-selected 30 days after the trial ends, with manual removal and no application-retention change; preserve the original Alpha evidence gates.
- Add a short private-text teacher trial pack, a blank feedback record and a dated protocol clarification for one-person coordination without direct observation; preserve the existing Alpha success gates.
- Specify school and exam-name presets: a school and footer-name default plus saved exam names in Settings, and a searchable Test title in paper setup where typing filters, picking fills and only an explicit action saves a name. Specification and prototype only; saving needs account storage (D9.4, MIN-252).
- Record the current shared-content/builders coverage audit and non-UI document/access/recovery verification; browsing four units does not imply four-unit generation support.

### Added

- Preview the generated Word files before download: **Generate** shows the student paper and answer key rendered in the browser from the exact files the teacher downloads, with **Download both files** beside them. Nothing is uploaded or stored. The preview works under the existing Content Security Policy without `'unsafe-inline'`. Font files are no longer inlined as `data:` URLs, which the policy refused, so the JetBrains Mono subset loads in production (D8.8, MIN-294).
- Show the paper plan as one connected bar coloured by question type and sized by marks, with details for each type (marks, items, share of the paper and the questions they come from) on hover or selection, and a jump to each question. Missing requested questions show as hatched space. The type colours are validated for colour-blind separation in light and dark (D8.7, MIN-287).
- Audit every screen right to left in Arabic at 320, 390 and 1280px in light and dark, with a Playwright and axe sweep. Fixed: paper thumbnails on My papers were aligned to the Arabic edge instead of staying left to right, the Settings account email was not isolated in its Arabic sentence, and candidate review lists used a physical left indent. The import and provenance file pickers now use an ExamGO picker in the interface language instead of the browser's own button text, and accept a dropped file (MIN-273, part of MIN-56).
- Translate the MineGO reviewer tools into Arabic: preset review and publication, source evidence records and their history, governed provenance intake, publication of approved revisions and question variety, with their error messages. Source records, prompts, names and reasons keep the language they were written in, and review dates follow the interface language (MIN-272, part of MIN-56).
- Translate recovery and error messages into Arabic: sign-in, session expiry and sign-out notices, saved-draft recovery issues on My papers, account limits, and the save, load, preset, passage and import failures teachers can reach. Support references stay visible as "الرمز المرجعي", and messages without a translation still appear in English (MIN-271, part of MIN-56).
- Translate Question banks into Arabic: the bank page and question list, the question form for every type with its validation messages, passages and linked exercises, and file import with its column questions, readable question checks, problems and remedies, totals and history. Question content keeps the language it was written in (MIN-270, part of MIN-56).
- Translate the New paper journey into Arabic: the paper choices, setup and its error summary and validation messages, the review controls, saving and downloads, the preset paper and complete exercise pages with their coverage tables, and the Iraqi exercises builder for saved drafts. The paper and answer key stay in English, and names and references are isolated so they read correctly in Arabic sentences (MIN-269, part of MIN-56).
- Move the selection number to **Settings › Question selection**. Each account starts with its own number, so teachers with the same settings get different papers; the number is kept on the device for that account until account settings exist (MIN-261). The per-paper field is removed.
- Rename **Use an approved exercise** to **Use a preset exam paper made by MineGO**, and remove **Iraqi exercises and writing** from New paper (saved drafts still open from My papers). Remove the question-pages choice; papers fit on two pages, and a note appears only past that.
- Add the Arabic interface foundation: per-screen string files checked for completeness, Arabic plural forms (for example "سؤالان" and "11 سؤالًا" on My papers), Iraqi month names with Western digits, and display-time translation of application messages that keeps support references. The sign-in password hint now uses Western digits (MIN-268, part of MIN-56).
- Show one error summary when the New paper setup has problems: it takes focus, links to each field and keeps the teacher's input. Field messages are linked to their fields instead of being separate announcements (D9.6, MIN-258).
- Rename Account to **Settings**, with one section per scope: the account (sign out, sign out of all devices), interface language and appearance on this device, the My papers default view on this device, and the reviewer tools entry. Device choices apply at once and confirm "Saved on this device", or say when the browser cannot remember them. Saved paper defaults wait for account storage (D9.3, MIN-253).
- Use one teacher name per question type on every screen (for example "Short answer" everywhere, "Fill in from a word bank", "Odd word out"), with Arabic names ready for review. The question form's type chooser is a grouped dropdown (Choose the answer / Write the answer) that says where the chosen type can be used in papers today; matching states that it is not in hosted papers yet. Stored types are unchanged (D9.1, MIN-249).
- Adopt a Radix icon vocabulary for repeated actions and an accessible help tip for secondary explanations (hover, keyboard focus, Escape, tap on touch screens; 44px target). Help tips explain the My papers timeline dates and the Filed note; essential instructions stay visible (D6.3, MIN-254).
- Rename Create exam to **New paper** and present the starts as three kinds of paper (Pick questions by type, Use an approved exercise, Iraqi exercises and writing) with honest Unit 1 coverage tags. A kind the teacher cannot make yet stays visible with its reason. The standalone approved pool becomes the **Shared MineGO questions** source under Pick questions by type, shown unavailable while supply is zero; the approved-exercise page shows complete exercises only. Paper generation contracts are unchanged (D6.2, MIN-248).
- Add Unit 1–4 preset bank choices beside the combined published bank, sharing canonical content and read-only access.

### Fixed

- Keep the finalized/ready stamp its own size on the paper: a My papers style stretched it down the sheet after My papers had been opened (MIN-275).
- Keep the paper progress steps on one row at narrow widths; below 40rem they show numbers, with the current step named.
- Place close timeline dates side by side on one row instead of stacking them.
- Apply shared paper-format rules to every new export and matching content preview: swap grade/school header placement and omit individual student point marks while preserving totals and answer-key scoring. Candidate verification and Word-review limits are recorded separately; not deployed.
- Integrate official preset banks into the same Active bank selector as personal banks, with the existing unit overview, search, filters and question list.
- Keep published passage context read-only while preserving personal-bank authoring and existing paper-generation limits.

This correction is an Unreleased task under the current development checkpoint. Its separate Preview artifact and inherited package metadata are recorded in the dated task evidence; no new product version is assigned here.

## 1.0.0-alpha.1 — 2026-10-20

Status: Alpha development checkpoint; not a published or deployed release.

### Added

- Official documentation index, teacher and development guides, system reference and Alpha limitations.
- Documentation-maintenance rules, a change-record template and an explicit Alpha/Beta/stable lifecycle.

### Changed

- Product package metadata now identifies Alpha 1 instead of the previous placeholder `0.0.0`.
- Repository introduction now describes ExamGO and links its maintained documentation.

Earlier implementation is preserved in dated source and phase evidence; this entry does not invent retrospective releases or new verification.

[Checkpoint details](docs/releases/1.0.0-alpha.1.md)
