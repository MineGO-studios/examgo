# Alpha workflow improvements: researched subtask proposal

21 October routing update: the eleven UI/UX tasks now belong to ExamGO Designing D6/D8/D9. Preparation and integrated evidence remain in ExamGO; conditional technical work has its own main-project hub and children. The [routing checkpoint](../maintenance/roadmap-project-routing-2026-10-21.md) supersedes the project placement/dependencies in this dated research record. The original research and 20 October readback below remain historical evidence, not current task placement.

ExamGO by MineGO Studio · 20 October 2026 (Asia/Baghdad) · `1.0.0-alpha.1`.

**Status: researched roadmap additions synchronized to Linear; implementation unstarted.** After initial connection failures, browser access recovered and the owner reconnected the plugin. MIN-246 was created through the browser and then expanded through the connector; MIN-247–259 were created through the connector without duplicates. Local P01–P14 identifiers map to verified issues below; they are not new phase numbers.

## Placement and execution boundaries

Verified parent and milestone: [Phase 16 — Private Teacher Alpha, MIN-20](https://linear.app/minego/issue/MIN-20/phase-16-private-teacher-alpha). P01–P02 support preparation; P03–P13 form a scoped Alpha workflow improvement workstream; P14 verifies and documents the resulting checkpoint. Before synchronization, inspect the live parent, children, milestones and dependencies, reuse matching issues, and preserve historical completed work. The dated [bank-work record](../phase-16/linear-bank-work-sync-2026-10-20.md) identifies MIN-243–245 as already completed at limited scope; this proposal must not duplicate or reopen them.

Phase 17 concerns Production readiness, so the proposed redesign should not be hidden inside its infrastructure or legal work. The current request authorizes research and roadmap additions, not implementation or starting Phase 17. Keep all proposed work unstarted. Separate small readiness repairs from the broader redesign so three available teachers are not made to wait for every optional improvement. Freeze the build/protocol for each observation round; changes require a new identified round and preserved earlier results.

UI/UX ownership follows the repository rule: the UI/UX owner handles interface design, copy, navigation, interaction and UI implementation. The technical owner may handle separately scoped domain, persistence, validation, documentation and tests. This planning record is not an app UI change. Record ownership in each Linear description; do not invent an account or assignee ID.

## Research basis

Sources were accessed on 20 October 2026. These support design approaches, not proof that a particular interface works for Iraqi teachers. Each proposed task below cites its applicable evidence. No new teacher sessions were conducted.

| Ref | Source and finding | ExamGO implication and limit |
| --- | --- | --- |
| R1 | [GOV.UK: moderated usability testing](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing). Use realistic goals, smaller tasks in logical order, neutral facilitation and observation. | Shorten participant material and move recording work to the observer. Session length is a planning choice, not a replacement success criterion. |
| R2 | [Nielsen Norman Group: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/). Secondary options can be deferred; separating tightly interdependent decisions can make work harder. | Keep related question counts, marks and available supply together; defer technical detail. A wizard or a merged screen remains a hypothesis to validate. |
| R3 | [Moodle: question types](https://docs.moodle.org/en/Question_types). Different response structures require different authoring and scoring models. | Borrow the separation of structures, not Moodle's full catalogue. Local source papers and existing contracts decide supported types. |
| R4 | [Moodle: building a quiz](https://docs.moodle.org/en/Building_Quiz). Questions can be authored, selected from a bank, or selected through a separate random-question flow. | Separate content source from assessment construction. Moodle's online quiz behavior does not establish printable-paper semantics. |
| R5 | [GOV.UK: question pages](https://design-system.service.gov.uk/patterns/question-pages/). Forms should ask clear, focused questions with appropriate labels and guidance. | Tailor each editor to its type and reveal optional fields only when needed. Do not split every related field into a separate page. |
| R6 | [W3C: combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). Editable comboboxes support filtering and choosing suggested or predefined values. | A searchable exam-name selector is appropriate for a growing saved list. Define whether typing selects, filters or creates; do not silently confuse those operations. |
| R7 | [Radix Icons](https://www.radix-ui.com/icons) provides individual React icons; [Radix Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip) supports focus/hover and Escape. [WCAG hover/focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) explains dismissible, hoverable, persistent additional content. | Adopt a consistent icon vocabulary with accessible names. Icons and tooltips are separate components. Essential instructions/errors/actions must remain understandable without hover. |
| R8 | [GOV.UK: check answers](https://design-system.service.gov.uk/patterns/check-answers/). Review should let users check information and change specific answers before submission. | Review the paper with targeted edits and a separate key view. This pattern does not prove browser-to-Word pagination parity. |
| R9 | [GOV.UK: error summary](https://design-system.service.gov.uk/components/error-summary/). Summaries and field-level messages help locate and repair errors. | Keep teacher input, link errors to affected fields and state the repair. Do not replace usable errors with technical logs or tooltip-only warnings. |
| R10 | [Diátaxis](https://diataxis.fr/) separates tutorials, how-to guides, reference and explanation. ExamGO's [documentation policy](../maintenance/documentation-and-versioning.md) already adopts this distinction. | Update the appropriate maintained document in the same change; avoid duplicate manuals. Version labels and release promotion follow project evidence gates. |
| L1 | [Current protocol](../phase-16/protocol.md) and [paper briefs](../phase-16/paper-brief-template.md). | Preserve distinct workflows, all-started-attempt denominator, independent completion and exact paired-document review. These dated materials require build-specific refresh. |
| L2 | [Source-shape inventory](../phase-13/source-shape-inventory-2026-10-11.md). Passage, mixed groups, matching, completion, rewrite, writing and other structures have distinct context and review constraints. | A passage is shared context, not necessarily one response type. Inventory counts are historical, not current eligible supply. |
| L3 | [Source-paper review](../phase-10-exam-002-source-review.md) and [fixture evidence](../fixtures/README.md). | Printed/attempted counts, matching columns, writing alternatives, spacing and mark placement matter. This is historical source-backed evidence, not a universal ministry specification or acceptance of new output. |

## Proposed subtasks

### P01 — Shorten the teacher-facing Alpha session materials

Placement: Phase 16 preparation. Ownership: research/documentation; interface changes, if later needed, follow UI ownership. Research: R1, L1. Dependencies: none.

- Prepare a short welcome/consent introduction, one recent-work question, two realistic task cards shown one at a time, and three debrief questions: what was hardest, what must change before reuse, and whether the resulting paper fits their work.
- Keep the observer checklist, technical evidence, timings and hashes out of participant instructions. Prepare accounts and reviewed banks beforehand. Schedule CSV preparation separately if needed; postponed import is untested.
- Plan approximately 30 minutes with breaks or a second visit when necessary; do not impose a speed gate or coach measured steps. Offer help when stuck and record intervention.
- Acceptance: a dry run confirms clear, non-leading task cards; protocol amendment is dated before affected attempts. Preserve three teachers, two distinct workflows each, at least 80% independent success across all starts, and zero known Alpha P0/P1 defects. Six starts require five independent successes and separate participation completion.
- Documentation: facilitator script, protocol amendment log, paper briefs and Phase 16 index. No participant records in the repository.

### P02 — Verify a low-friction first session on the actual hosted build

Placement: Phase 16 preparation. Ownership: verification/support; UI/UX owner for any interface remedy. Research: R1, R9, L1. Depends on P01.

- Verify ordinary teacher access, usable eligible banks, two feasible supported briefs, language/device, downloads and Word availability before sessions. Keep setup separate from measured composition.
- Identify one private support route and consent/retention owner. Do not require technical reports, administrator access or forced error scenarios from teachers.
- Acceptance: readiness checklist passes for the exact build; unsupported briefs stay blocked rather than quietly weakened. Record any remaining login/content/output gap.
- Documentation: readiness record and known limits. This is preparation, not teacher success evidence.

### P03 — Redesign the complete bank-to-paper workflow and evaluate merging paths

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for UI/UX, with separate domain review. Research: R2, R4, L2. Dependencies: current deployed-flow inventory, including MIN-243–245 readback.

- Review My question banks, Approved preset papers, Iraqi exercises and writing, and passage authoring/reuse as one end-to-end task. Compare a unified paper-building entry point with separate specialized flows; record why each path is merged or retained.
- Treat private/published banks as content sources and presets as starting structures. Do not make teachers understand internal provenance mappings to start a paper.
- Preserve private ownership, published read-only content, review/publication eligibility, complete linked context and historical paper behavior. A visual merge does not authorize merging canonical records or enabling every hidden builder.
- Acceptance: agreed journey map, old-to-new route mapping, prototype walkthrough and explicit empty/loading/permission states. Demonstrate both simple and compound paper tasks with no lost capability or misleading format promise.
- Documentation: design decision, teacher guide, capability/eligibility matrix and compatibility notes. This is follow-up work; preserve prior bank tasks' completion scope.

### P04 — Rework question-type vocabulary and its domain mapping

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for labels/type chooser; domain owner for contracts. Research: R3, L2, L3. Depends on P03.

- Build a catalogue mapping teacher terms to current canonical types, shared context, scoring, authoring, import, selection and renderer support. Cover multiple choice, binary, short answer, matching, completion/word bank, rewrite, relationships/odd-one-out and writing where source evidence supports them.
- Model passage-based items through shared context and child response types; distinguish standalone from contextual questions where needed. Preserve choose-from-brackets, mixed groups and meaningful source variants.
- Acceptance: every existing type maps without silent conversion, dropped options/answers or invented marks. Unsupported types have an explicit state. Any contract change gets a compatibility/migration plan before implementation.
- Documentation: type reference and import/domain mapping. No catalogue-wide migration is authorized by planning.

### P05 — Rebuild the add/edit question menu for each supported type

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for UI/UX; domain validation separately. Research: R3, R5, R9, L2. Depends on P04.

- Design type-specific forms: options and selected answer; binary answer; accepted short answers; List A/List B and pair mapping; text/blanks and shared word bank; rewrite prompt/reference; relationship/odd-word choices; writing prompt, sample/rubric and alternatives; shared passage plus linked children.
- Expose relevant fields only; preserve teacher input when switching or canceling, with confirmation before discarding incompatible fields. Keep source attribution/review metadata available in secondary details.
- Acceptance: valid save/edit/reopen, missing answers, invalid pair mappings, orphan context, ambiguous blanks, manual-marking cases and canceled type changes are checked. Unknown source marks remain unknown. Private authoring does not publish shared content.
- Documentation: authoring guide, type validation reference and examples.

### P06 — Add “how many of each type” composition controls

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for controls; domain owner for selection/scoring. Research: R2, R4, L1–L3. Depends on P03–P04.

- Interpret the requested “more type” as quantities per type, not merely adding more type names. Define whether each count means complete exercises, printed items or required answers; keep these distinct.
- Show available eligible supply, requested count, attempted count and marks together. Respect unit scope, complete passages/matching groups, locks, exclusions, canonical uniqueness and valid replacement choices.
- Acceptance: zero/invalid/over-supply counts, mixed units, choose-five-of-six, grouped content and unavailable replacements produce explicit results without silent type substitution or partial-group splitting. One validated snapshot drives student and key.
- Documentation: composition rules with worked examples and feasibility limitations.

### P07 — Add school and exam-name presets with searchable selection

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for UI/UX; persistence/authorization separately. Research: R6, R8. Depends on P03 and P08's settings contract.

- Let teachers maintain a school-name default and many named tests/exams in Settings, then choose through a searchable dropdown in paper setup. Support explicit add, rename, remove/archive and no-results behavior.
- Make the final selected header editable per paper. Define duplicate/blank-name handling and Arabic/English search without altering stored display names. Defaults belong to the teacher, not every account.
- Acceptance: keyboard/touch selection, empty list, long/bilingual names, save failure and account isolation are verified. Changing or removing a preset cannot rewrite an existing saved/finalized paper; store the selected values with that paper.
- Documentation: settings/header guide, persistence contract and historical regeneration behavior.

### P08 — Introduce a focused Settings area

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for UI/UX; persistence/authorization separately. Research: R2, R5, R6. Depends on P03.

- Inventory stable preferences and optional defaults before adding controls. Initial scope: school/exam-name presets, supported language/direction preferences and supported paper defaults where those capabilities exist. Separate account settings, reusable defaults and overrides for one paper.
- Provide explicit save state, cancel/reset behavior and clear scope. Keep essential composition decisions close to the paper; avoid a collection of unexplained switches. A proposed setting must have a supported effect.
- Acceptance: persistence, failed save/retry, sign-out/account changes and per-paper overrides are tested; no preference leaks between teachers. Document whether settings are account-backed or device-local.
- Documentation: settings reference, default precedence and recovery behavior.

### P09 — Use Radix icons and concise accessible help

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner. Research: R7, R2. Depends on P03.

- Adopt a defined Radix icon vocabulary for repeated actions and short contextual tooltips for secondary explanations. Review licensing and existing dependencies; adding the icon kit does not require replacing the whole component system.
- Retain visible text for primary or ambiguous actions, errors, required instructions and safety-critical information. Every icon button has an accessible name; tooltips are not the only way to discover meaning on touch devices.
- Acceptance: keyboard focus, Escape dismissal, pointer hover persistence, screen-reader names, touch alternatives, contrast, hit targets and RTL are checked. The 15-pixel icon artwork is not the button's hit-target size.
- Documentation: component/icon usage rules and accessibility evidence.

### P10 — Make paper review a preview of the paper itself

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for review interaction; renderer/domain owner for parity. Research: R8, L1, L3. Depends on P03, P06 and P11's output specification.

- Make the paper the main review surface with section-specific edits, header, full context, numbering, marks and answer spaces; provide a distinct answer-key view. Keep diagnostics in optional details.
- Define whether the preview is approximate or produced by the actual export renderer. Do not promise exact Word pagination from an HTML estimate.
- Acceptance: edits preserve other work; preview, saved snapshot and exported student/key content agree; student preview has no answers. Human acceptance remains attached to the exact exported pair and target application.
- Documentation: review guide, preview/export fidelity contract and known pagination limits.

### P11 — Refine output against approved ministerial-style reference papers

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for document visual specification; renderer implementation separately scoped. Research: L2–L3. Depends on P04 and paper-header contract from P07.

- First inspect the approved reference papers for the intended grade, exam purpose/year/round; record which are actual ministerial papers versus teacher models. Compare multiple available examples before treating a feature as a convention. Missing references stay a gap.
- Produce a sourced specification for header, school/exam names, question branches, instructions, attempted marks, tables, passage continuity, writing space, page breaks and key alignment. Preserve meaningful variability; do not add official seals or imply ministry endorsement.
- Acceptance: production rendering path and fixtures cover simple and compound papers, long text, Arabic/English, matching, passages and writing alternatives. Verify structure and scoring, then obtain human Word review for exact output hashes. Do not locally render DOCX without explicit authorization. No automatic one-page guarantee or source-error copying.
- Documentation: source comparison/specification, renderer compatibility/version and exact paired-artifact acceptance.

### P12 — Simplify general onboarding, navigation and everyday wording

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner. Research: R2, R5. Depends on P03–P04.

- Offer a clear first-paper action, useful empty states and optional short help. Replace implementation terms with tested teacher terms; keep detailed provenance available where a teacher needs to inspect trust or source.
- Reduce repeated panels and required decisions; show advanced options when relevant. Keep counts, marks, content availability and unsaved state visible. Avoid compulsory tours or technical questionnaires.
- Acceptance: first use and repeat use can reach a valid supported paper without opening technical detail; back navigation retains work. Review mobile, keyboard, English and Arabic behavior against the actual supported scope.
- Documentation: updated teacher guide and terminology reference. Measure confusion and assistance, not just fewer clicks.

### P13 — Improve draft recovery, field errors and safe repeat actions

Placement: Phase 16 improvement workstream. Ownership: UI/UX owner for UI messages/interaction; persistence and retry logic separately. Research: R9, R8. Depends on P03 and affected form/settings contracts.

- Show reliable saving/saved/failed states; retain input after validation or network errors; make retry and return-to-work clear. Link errors to the affected fields or paper sections.
- Review duplicate/save/download/reopen actions for repeated clicks and partial failure. Preserve same-owner recovery and the existing sign-out/account-isolation boundaries; never restore one teacher's private draft to another.
- Acceptance: targeted failure tests cover failed save, expired session, duplicate action, invalid item and export failure. No false success or silent data loss. Error details may have a support reference but must not expose private content or credentials.
- Documentation: recovery guide, error reference and exact persistence/authorization checks.

### P14 — Validate and document each major workflow checkpoint

Placement: Phase 16 closeout support, repeated at each major change. Ownership: each implementing contributor; UI acceptance remains with the UI/UX owner and the project owner. Research: R1, R10, L1–L3. Depends on the selected completed improvement slice, not automatic completion of all proposals.

- Follow [docs/README.md](../README.md) and the [documentation/versioning policy](../maintenance/documentation-and-versioning.md) in every task. Record scope, affected guides/contracts, version/checkpoint, compatibility/security/content implications, exact checks, remaining limits and live issue link.
- Run change-appropriate domain, integration, authorization, browser/accessibility and document checks; record unperformed layers. Recheck affected teacher tasks on the identified build, keeping earlier attempts and intervention records.
- Acceptance: no major change closes without its documentation and evidence. Update the changelog for delivered behavior; advance the prerelease only at an accepted application checkpoint. Alpha/Beta/stable promotion remains evidence-gated and separately approved. Use neutral product documentation without generated-by labels or authoring credits.
- Phase gate is unchanged. No checklist closes on the strength of this proposal or the existence of a new version label.

## Synchronization procedure and evidence

1. Reconnect Linear and fetch MIN-20, current children/milestone and parent/dependency details. Inspect any existing equivalent work before creating issues.
2. Place P01–P02 under preparation and P03–P14 under a distinct Phase 16 improvement grouping after confirming the live sequence. Do not renumber accepted phases or silently expand original success thresholds. If a live scope conflict exists, record it before moving anything.
3. Create or narrowly extend unstarted subtasks with the research, ownership, acceptance and documentation requirements above. Add the explicit dependency links; keep Alpha session readiness separate from optional enhancements. No automatic assignment to an unverified user identity.
4. Re-fetch issues to verify exact parent/milestone, state, descriptions, dependencies, sources and preserved historical evidence. Then append actual issue links and synchronization results here.

Current verification: local protocol, source-shape/source-paper records, documentation policy, version metadata and working-tree state inspected. Web research informs every proposal. Main checkout is `ui-ux-refresh-old-base` at `00d655e3eca7522bedd7bab096400721df403dec`, with pre-existing documentation/package changes. Later bank work has separate dated Preview evidence and was not retested here. Linear synchronization is verified below; human usability/output validation remains pending. No app source, UI, protocol, database, package version or deployment changed in this task.

### Linear synchronization readback

All 14 issues were re-fetched: parent MIN-20, Phase 16 milestone, Backlog, researched scope, ownership/documentation requirements and dependency relations verified. The parent now explicitly records the owner-requested 16C planning expansion beyond defect repair. Original description is preserved as an unchanged prefix (trailing whitespace normalized); original gates, status and relations are preserved. Phase 17 remains Backlog with unchanged description and relations. Linear created automatic related links while parsing mentions; unintended parent links were removed. Phase 17 metadata timestamp changed during that correction, not its scope or execution status.

| Local reference | Linear issue | Verified state | Blocked by |
| --- | --- | --- | --- |
| P01 | [MIN-246](https://linear.app/minego/issue/MIN-246/16a-shorten-the-teacher-facing-alpha-session-materials) | Backlog | None |
| P02 | [MIN-247](https://linear.app/minego/issue/MIN-247/16a-verify-a-low-friction-first-session-on-the-actual-hosted-build) | Backlog | MIN-246 |
| P03 | [MIN-248](https://linear.app/minego/issue/MIN-248/16c-improvement-redesign-the-complete-bank-to-paper-workflow-and) | Backlog | None |
| P04 | [MIN-249](https://linear.app/minego/issue/MIN-249/16c-improvement-rework-question-type-vocabulary-and-its-domain-mapping) | Backlog | MIN-248 |
| P05 | [MIN-250](https://linear.app/minego/issue/MIN-250/16c-improvement-rebuild-the-addedit-question-menu-for-each-supported) | Backlog | MIN-249 |
| P06 | [MIN-251](https://linear.app/minego/issue/MIN-251/16c-improvement-add-how-many-of-each-type-composition-controls) | Backlog | MIN-248, MIN-249 |
| P07 | [MIN-252](https://linear.app/minego/issue/MIN-252/16c-improvement-add-school-and-exam-name-presets-with-searchable) | Backlog | MIN-248, MIN-253 |
| P08 | [MIN-253](https://linear.app/minego/issue/MIN-253/16c-improvement-introduce-a-focused-settings-area) | Backlog | MIN-248 |
| P09 | [MIN-254](https://linear.app/minego/issue/MIN-254/16c-improvement-use-radix-icons-and-concise-accessible-help) | Backlog | MIN-248 |
| P10 | [MIN-255](https://linear.app/minego/issue/MIN-255/16c-improvement-make-paper-review-a-preview-of-the-paper-itself) | Backlog | MIN-248, MIN-251, MIN-256 |
| P11 | [MIN-256](https://linear.app/minego/issue/MIN-256/16c-improvement-refine-output-against-approved-ministerial-style) | Backlog | MIN-249, MIN-252 |
| P12 | [MIN-257](https://linear.app/minego/issue/MIN-257/16c-improvement-simplify-general-onboarding-navigation-and-everyday) | Backlog | MIN-248, MIN-249 |
| P13 | [MIN-258](https://linear.app/minego/issue/MIN-258/16c-improvement-improve-draft-recovery-field-errors-and-safe-repeat) | Backlog | MIN-248 |
| P14 | [MIN-259](https://linear.app/minego/issue/MIN-259/16c-improvement-validate-and-document-each-major-workflow-checkpoint) | Backlog | None |

P14 is a recurring checkpoint obligation per selected delivered slice; it is not blocked on all optional enhancements. P10 preserves the accepted MIN-41/MIN-42 synchronized HTML content-preview/browser-DOCX approach; richer rendering still needs a separate owner decision. P03/P05/P12/P13 explicitly preserve completed bank, authoring and wording work. All implementation remains unstarted. This documentation checkpoint retains 1.0.0-alpha.1; no release is created.

