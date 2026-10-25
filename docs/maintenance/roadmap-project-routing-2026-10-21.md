# ExamGO roadmap project routing checkpoint

ExamGO by MineGO Studio · 21 October 2026 (Asia/Baghdad) · `1.0.0-alpha.1`.

**VERIFIED AT LIMITED SCOPE: tracker organization and documentation only.** The owner requested moving current UI/UX work to ExamGO Designing and correcting ExamGO's phase structure. No application behavior, product version, database, deployment or release changed. Fetch live issues before implementation; this is a dated change record, not a competing task board.

## Project authority

| Project | Owns |
| --- | --- |
| [ExamGO](https://linear.app/minego/project/examgo-496f93ecf2e7) | Product lifecycle phases, curriculum/content, non-UI technical contracts, security/operations, Alpha/pilot evidence and release decisions. |
| [ExamGO Designing](https://linear.app/minego/project/examgo-designing-68b923d0319d) | UI/UX-owned workflow/visual specifications, prototypes, UI copy, navigation, interactions, client interface work and owner visual acceptance. |

The UI/UX owner may also perform authorized non-UI work. The technical owner may handle authorized non-UI contracts, persistence, validation, tests and documentation; UI/UX changes by the technical owner still require explicit permission. Moving issues grants no implementation, migration, publication or deployment permission.

## Current design organization

Five project milestones now group the established workstreams:

- D6: foundations, the existing dropdown rule, shared workflow architecture and Radix/accessibility help.
- D7: My papers and its existing timeline work.
- D8: Create exam, quantities per type, ministerial-style specification and paper-shaped review.
- D9: banks/passages, type vocabulary/forms, Settings and searchable school/exam-name presets, onboarding/recovery interaction, account/sign-in and full Arabic interface work.
- D10: review and owner acceptance for a named selected rollout.

D7/D8/D9 are coordinated surfaces after D6. Their explicit subtask links govern ordering; numerical labels do not require all D8 work before D9. Earlier D0–D5 records retain their actual status/evidence. The existing Arabic task is grouped under D9 instead of a standalone ambiguous Phase 2; the conditional backend Phase 3 is now the technical hub in ExamGO.

The D8 parent explicitly records that the new owner request supersedes its earlier exclusion of a new builder layout for the selected new slice. This changes planning scope, not the approved visual direction or implementation status.

## Current UI/UX tasks transferred by the same IDs

The eleven formerly Phase 16 UI/UX issues were moved and reparented; none was copied or marked complete. Each remains Backlog. Original research and product requirements are retained below a dated current ownership/handoff section. Linear normalized some Markdown emphasis around existing issue mentions; semantic content remains.

| Issue | Design workstream | Scope |
| --- | --- | --- |
| [MIN-248](https://linear.app/minego/issue/MIN-248) | D6 | Unified bank-to-paper workflow architecture |
| [MIN-254](https://linear.app/minego/issue/MIN-254) | D6 | Radix icons and accessible contextual help |
| [MIN-249](https://linear.app/minego/issue/MIN-249) | D9 | Question-type vocabulary and authoring specification |
| [MIN-250](https://linear.app/minego/issue/MIN-250) | D9 | Type-specific question addition and editing forms |
| [MIN-253](https://linear.app/minego/issue/MIN-253) | D9 | Settings structure and optional preferences |
| [MIN-252](https://linear.app/minego/issue/MIN-252) | D9 | School and exam-name presets with searchable selection |
| [MIN-251](https://linear.app/minego/issue/MIN-251) | D8 | How many of each question type |
| [MIN-256](https://linear.app/minego/issue/MIN-256) | D8 | Source-backed ministerial-style paper specification |
| [MIN-255](https://linear.app/minego/issue/MIN-255) | D8 | Paper-shaped review and student/key interaction |
| [MIN-257](https://linear.app/minego/issue/MIN-257) | D9 | Simpler onboarding, navigation and teacher wording |
| [MIN-258](https://linear.app/minego/issue/MIN-258) | D9 | Save, error and recovery interaction states |

Design completion must identify accepted specification, prototype and actual interface implementation separately. The full runtime conditions in the original researched requirements remain binding at integration. Design acceptance cannot establish persistence, authorization, export parity, teacher independence or exact Word layout.

## Main-product technical handoff

The existing [conditional technical hub](https://linear.app/minego/issue/MIN-57) moved from ExamGO Designing into Phase 16C under the Alpha issue, preserving its original candidate list and Backlog state. The following unstarted non-UI children separate previously mixed work:

| Issue | Technical responsibility | Prerequisite design specifications |
| --- | --- | --- |
| [MIN-260](https://linear.app/minego/issue/MIN-260/16c-integration-question-contracts-and-count-feasibility) | Question/domain validation, group integrity, counts/marks and feasible selection. | Type vocabulary/forms and quantity controls. |
| [MIN-261](https://linear.app/minego/issue/MIN-261/16c-integration-teacher-settings-and-saved-header-values) | Teacher settings persistence, header values, overrides, account isolation and historical snapshot compatibility. | Settings and searchable header-presets specification. |
| [MIN-262](https://linear.app/minego/issue/MIN-262/16c-integration-workflow-data-access-and-draft-recovery) | Data adapters, recovery, authorization and retry behavior for selected workflows. | Unified workflow and error/recovery specification. |
| [MIN-263](https://linear.app/minego/issue/MIN-263/16c-integration-ministerial-style-rendering-and-paired-output-parity) | Production rendering, paired snapshot/preview/output parity and exact human document acceptance. | Review/output specifications, plus question/settings contracts. |

A reviewed design specification can precede its technical consumer. No reverse blocker makes the specification wait for that same implementation. If new APIs require later interface wiring, record that integration step against the available contract; do not report a prototype as a usable feature. Optional candidate features are not all authorized by the existence of this hub.

## Corrected Alpha sequence

1. Prepare accounts, reviewed content and lighter participant tasks. [Session materials](https://linear.app/minego/issue/MIN-246) and [hosted readiness](https://linear.app/minego/issue/MIN-247) stay in ExamGO Phase 16A with their original dependency and scope.
2. Observe feasible supported real workflows under the frozen build/protocol and record all starts, interventions and target-application outcomes.
3. Triage actual blockers versus preferences. Resolve applicable blockers and integrate only the selected design-dependent technical slice through Phase 16C.
4. Use the [integrated evidence/documentation checkpoint](https://linear.app/minego/issue/MIN-259) for the exact selected implementation and original human gates.

Do not make the three teachers wait for every optional redesign feature. No blanket dependency from Alpha preparation to completion of the design project was added. Original participation remains three real teachers completing two distinct workflows each; independent success remains at least 80% of all started eligible attempts with acceptable matching documents; no known Alpha P0/P1 security/data-loss/wrong-answer/invalid-paper defect may remain. A design review, prototype or milestone percentage cannot satisfy these conditions.

Completed historical phases remain at their recorded scope and number. The original Phase 16 checklist/history preceding the superseded 20 October additions is preserved. Phases 17–19 descriptions/statuses remain unchanged and unstarted; failed/inconclusive/stopped pilot evidence may still reach its existing evidence decision without being relabeled success. Later expansion remains gated by the original conditions.

## Documentation, version and verification

Both projects follow [docs/README.md](../README.md) and the [documentation/versioning policy](documentation-and-versioning.md). Every major selected implementation must update relevant guides/reference, compatibility/security/content implications, changelog/checkpoint evidence and exact verification. This planning checkpoint keeps `1.0.0-alpha.1`; it does not create a new application release.

Readback verified transferred project/parent/milestone assignments, unchanged states, preserved original research, native prerequisite links, design-parent prior progress and later lifecycle statuses. The exercised dependency graph contains no cycle. A new unintended informational relation to Phase 17, introduced by Linear parsing an existing mention, was removed; no release dependency was added.

Main repository inspected: `ui-ux-refresh-old-base` at `00d655e3eca7522bedd7bab096400721df403dec`. Existing dirty documentation/package work was preserved. Only documentation changed locally. Link/format/version checks are appropriate; no application tests, browser product checks, database checks or human Word acceptance were performed or claimed for this organizational change.

