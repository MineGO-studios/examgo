# Bank-to-paper workflow architecture (D6.2)

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · draft v0.1, 21 October 2026.

Status: **direction and prototype accepted by the owner; first slice wired into the application** (section 9). Remaining steps depend on MIN-260/MIN-262. Tracker: [MIN-248](https://linear.app/minego/issue/MIN-248).

## 1. What exists today

A teacher currently meets three separate starts under Create exam, plus two that only development builds show.

| Today's start | What it really is | Source of questions | Coverage today |
| --- | --- | --- | --- |
| My question banks | A paper picked by type counts: multiple choice, true/false or yes/no, short answer | The teacher's private banks (a paper may combine several) | Grade 6, Unit 1. Needs enough private standalone questions. |
| Approved preset papers | Either standalone approved questions, or one complete approved exercise kept in source order | Published MineGO content | Standalone pool: currently zero candidates. Complete exercises: six Unit 1 multiple-choice groups. |
| Iraqi exercises and writing | A fixed source-style excerpt (Q3/A to Q5: completion, odd word, relationship, rewrite, writing) | Private banks, 16 suitable records | Unit 1 only, fixed profile. Not a full paper or a general passage builder. |
| Complete paper candidate (development) | Fixed-profile full paper | Private banks | Not offered to teachers. |
| Structured paper (development) | Configurable blueprint | Private banks | Not offered to teachers. |

Question banks now shows personal banks beside shared MineGO banks and Unit 1 to 4 preset views. These views are for browsing only: they do not widen what a paper can be generated from (see the [coverage reference](../reference/alpha-content-and-builder-coverage-2026-10-21.md)).

**The gap.** A teacher has to know the internal difference between "my banks", "approved preset" and "Iraqi exercises" before starting. The three starts mix two different questions:

- where the questions come from (the source);
- what shape the paper takes (the structure).

The shared banks the teacher can browse are not obviously connected to the papers they can make.

## 2. Principles carried into the design

- **Source and shape are separate decisions.** Banks (private or shared) are sources. A preset is a starting structure, not a third kind of bank. This follows the research note on Moodle's split between the question bank and quiz construction.
- **Keep decisions that depend on each other together.** Question counts, marks and available supply stay on one screen, and technical detail is deferred (progressive disclosure).
- **Never promise what cannot be produced.** A shape with no eligible supply stays visible but disabled, with its reason in plain words. It is never removed silently or offered and then failed later.
- **Preserve every boundary.** Private ownership, read-only shared content, publication eligibility, complete linked context, historical saved papers, and development-only builders stay exactly as they are. A visual merge does not merge canonical records.

## 3. Proposed journey (for owner review)

One entry, **New paper**, in five steps. The step row already exists and is kept.

1. **Choose the paper's shape.** There are three cards, each with a miniature sheet showing what it produces:
   - **Pick questions by type.** You choose how many of each type and the marks. This replaces "My question banks" and absorbs the standalone approved pool once one exists.
   - **Use an approved exercise.** One complete MineGO exercise in source order, with its answer rule. This is today's complete-preset path.
   - **Iraqi exercises and writing.** The fixed Q3/A to Q5 source excerpt. Its card says plainly that it is an excerpt, not a full paper.

   Each card shows its real coverage ("Unit 1", "6 exercises available") from current data.
2. **Choose sources.** This step only shows what the chosen shape can actually use.
   - Pick by type: your banks, and shared MineGO questions once standalone supply exists. The dropdown appears above five banks.
   - Approved exercise: a list of eligible exercises with "students answer X of Y".
   - Iraqi exercises: the primary bank, plus "also use".
3. **Compose.** Counts per type, marks and pages, with the live supply beside each count.
4. **Review.** The paper-shaped student view and answer key (D8.3).
5. **Download.** The paired student paper and answer key, using the Coupon Book finalize moment.

My papers (D7) stays the place to return to any draft or finalized paper. Question banks stays the place to author and browse.

## 4. Old-to-new route mapping

| Old entry | New location | Change |
| --- | --- | --- |
| Create exam → My question banks | New paper → Pick questions by type → Your banks | Renamed and placed under a shape |
| Create exam → Approved preset papers (standalone) | New paper → Pick questions by type → Shared MineGO questions | Disabled with a reason while supply is zero |
| Create exam → Approved preset papers (complete exercise) | New paper → Use an approved exercise | Same contract |
| Create exam → Iraqi exercises and writing | New paper → Iraqi exercises and writing | Same contract, clearer label |
| Development starts | Unchanged, development builds only | None |
| My papers → Continue | Reopens the same shape at Compose or Review | No change in behaviour |

## 5. Capability and state matrix

| Shape | Units now | Sources | Empty state | Loading | Permission |
| --- | --- | --- | --- | --- | --- |
| Pick by type | 1 | Private banks (more than one allowed) | "Add or import questions to a bank first", with a link to Question banks | Supply per type loads in place | Shared items are read-only, and editing is offered only in the owner's own bank |
| Approved exercise | 1 | Published groups | "No approved exercises are available yet" | The exercise list loads in place | Read-only, used in source order |
| Iraqi exercises | 1 | Private banks, 16 records | Lists which of the 16 required records are missing | Profile check runs in place | Private only |

Units 2 to 4 appear as "browse only" in Question banks until a technical contract extends generation (MIN-260). The design marks that limit; it does not hide it.

## 6. Owner decisions (21 October 2026)

1. **The entry is renamed New paper.** The navigation label changes from "Create exam" to "New paper".
2. **Standalone approved questions are a source under "Pick by type"**, not a separate start. While supply is zero, the source is shown disabled with its reason.
3. **An unavailable shape or source is shown disabled with a plain reason**, never hidden. Where a fix exists, the reason links to it (for example, Question banks).

## 7. Prototype (21 October 2026)

The clickable prototype covers all five steps of the journey in section 3, with the owner decisions applied.

A prototype-only control switches between four data states:

- a typical teacher (three banks; chips);
- seven banks, where the dropdown rule applies;
- a new teacher with no banks;
- loading.

The disabled shapes and sources show their reasons, and "Open Question banks" is the fix link. The Iraqi path shows a profile check of all 16 required records.

It uses sample data only and is not wired to the application. Location: the published prototype artifact linked from MIN-248. Its source is kept outside the repository.

**Checks performed (Playwright, prototype layer only):**

- Flows walked:
  - pick-by-type: shape, sources, compose and review, with the answer key;
  - approved exercise: through to download;
  - the new-teacher, seven-bank and loading states;
  - Iraqi exercises in Arabic at 390px;
  - dark mode.
- No script errors.
- No horizontal overflow at 390 or 1280.
- axe WCAG A/AA: 0 violations in every walked state, after one missing label on the exercise marks field was fixed.
- Reduced motion was emulated.

This is not teacher usability evidence and not runtime acceptance.

## 8. Remaining for D6.2

- Owner review of the prototype. Record the changes the owner asks for.
- The runtime contract work goes to MIN-260 and MIN-262. UI wiring of the New paper entry gets its own scoped follow-up after those contracts exist, or uses the existing contracts where they already suffice: renaming the navigation, grouping the starts as shapes, and the disabled standalone source.
- The teacher guide is updated when the journey ships.

## 9. First application slice (21 October 2026)

The owner approved the prototype. The parts that existing contracts support are now in the application:

- **Rename:** the navigation and page heading read **New paper** in English and Arabic.
- **Shape cards:** the starts are the three shape cards, with "Unit 1" (and "Excerpt") coverage tags. When the teacher has no bank, "Pick questions by type" stays visible, focusable and announced as unavailable with its reason.
- **Approved exercise:** the "Use an approved exercise" page shows complete exercises and the finalized history only.
- **Shared MineGO questions:** this source appears under "Pick questions by type". It shows unavailable with its reason while approved standalone supply is zero, shows a plain message if supply cannot be checked, and opens the existing standalone preset flow once supply exists.

Generation, finalization and storage contracts are unchanged. Not yet wired: separate Sources and Compose steps, live per-shape supply on the cards, and the Iraqi profile pre-check. These wait on MIN-260/MIN-262.

**Verification:**

- vitest: 600 passed, 6 skipped.
- App and e2e TypeScript, and lint: pass.
- Design detector: 0 findings.
- Playwright: 29/29. This includes the new `local-new-paper.spec.ts`, which covers the shapes, the empty shared source and the disabled shape for a teacher without banks, each with axe at the default width.
- Visual check at 1280 light, 390, and dark for a teacher without banks.
