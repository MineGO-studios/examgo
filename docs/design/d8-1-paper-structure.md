# D8.1 — Paper structure: how many of each question type

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 23 October 2026 · [MIN-251](https://linear.app/minego/issue/MIN-251)

Status: **prototype for owner review.** The prototype is shared with the owner separately. It uses sample supply numbers and provisional type names (the owner will name the types later, MIN-249). Nothing here is wired; the data and output contract it needs is in the ExamGO issue linked at the end.

## Main reference

The ministerial papers (D8.2) are ExamGO's main reference for paper structure (owner decision, 31 October 2026). This set holds 23 papers from 2019 to 2026, reconstructed from page images, and it is authoritative. New designs and specs default to its shape: questions with lettered parts, items shown and answers required, part marks, the bilingual note, and Q | Point | Answer keys. The simple paper (counts per type, one question per heading) remains only as a compatibility path for existing drafts. Marks stay teacher-set and are never fixed.

## The problem

New paper asks "how many of each type", one stepper per type, and prints one question per heading. Ministerial papers (D8.2) are built from parts: each part has a type, shows a number of items, asks the student to answer some of them, and carries marks. A single count cannot say which of those it means.

## The four numbers

Every part keeps four values together, because they depend on each other:

| Value | Meaning | Example |
| --- | --- | --- |
| Type | What kind of exercise the part is | Reading passage |
| Items shown | What the paper prints | 6 questions |
| Answers required | How many the student must answer; never more than shown | 5 |
| Part marks | Marks for the answers required, set by the teacher | 10 |

From these the screen derives the attempt rule ("Students answer 5 of 6"), the marks per answer ("2 marks per answer", or a note when the split is uneven), the question total and the paper total.

## Controls

- **Start from:** Exam layout (Q1–Q5 with A and B parts, from the D8.2 evidence), Short test (two questions), or Start empty. A template only fills the parts; every value stays editable.
- **Questions:** each question is a grouped list. Its header shows the question number and its total marks; it can be removed.
- **Parts:** up to four per question, lettered A–D when there is more than one. Each part row has the type dropdown, then three steppers: Items shown, Answers required, Part marks. The hint line under them states the attempt rule and the marks per answer.
- **Running total:** a status bar stays at the top while scrolling: the paper total in marks, the number of questions and parts, and how many parts need attention.
- **Marks are never fixed** (owner decision, 23 October 2026). New papers start from the teacher's default marks in Settings (MIN-261). The ministerial 10/20/100 values appear only through the Exam layout template.

## Exercises that are used whole

Passages, matching sets and word boxes are complete exercises. ExamGO never splits them, so their Items shown comes from the exercise and its stepper is read-only, with the line "A complete set of 6. Sets are never split." Answers required stays editable (answer 5 of the 6). Writing shows two alternatives and the student writes one.

## Supply and corrections

Under each part, a mono line states what the bank can supply for it in the current unit scope, counted in the part's own unit: questions, sentences, passages, sets, boxes or task pairs.

When the bank cannot fill a part, the line becomes a warning that says what is missing, such as "This part shows 6 questions, but the bank has 3", with the choices that would fix it:

- **Show 3 instead:** only for item types; it lowers Items shown, and Answers required if needed.
- **Include Unit 2:** widens the unit scope.
- **Change type:** moves focus to the type dropdown.

Preview stays disabled while any part needs attention, and the total bar counts those parts. ExamGO never substitutes another type silently or splits a set to fill a gap.

## Worked examples

1. **Ministerial exam.** Q1 A: Reading passage, 6 shown, 5 answered, 10 marks (2 per answer). Q5: Writing, 2 shown, 1 answered, 20 marks. Nine parts, 100 marks.
2. **Monthly test.** Short test: Q1 Choose the answer 6/5 for 5 marks (1 per answer); Q2 Matching, a complete set of 6, answer 5, 5 marks. 10 marks.
3. **Uneven marks.** A part shows 6, answers 4, carries 10 marks. The hint says the split is uneven and that each item's marks are set in review.
4. **Short supply.** Q4 B Missing forms needs 6 questions; Unit 1 has 3. The part shows the warning; "Include Unit 2" raises supply to 8 and the warning clears.

## Accessibility and language

- Every part is a labelled group ("Question 2, part B"); each stepper's buttons name their field ("More: Items shown").
- The total bar is a status region, so changes are announced.
- Focus stays on the control that changed after each update.
- Arabic mirrors the layout; question codes such as Q1 stay left to right; digits stay Western.
- Dark mode uses the ExamGO tokens; touch targets are at least 44px.

## What the prototype does not decide

- Type names (owner, MIN-249) and the Figma question presentation (MIN-292).
- How parts look on the review step and in the Word files (D8.3, MIN-255; renderer MIN-263).
