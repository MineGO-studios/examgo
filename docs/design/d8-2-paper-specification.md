# D8.2 — Ministerial-style paper specification

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 23 October 2026 · [MIN-256](https://linear.app/minego/issue/MIN-256)

Status: **specification for owner review.** It describes the papers ExamGO should produce and how far today's output matches. It changes no renderer; renderer work belongs to [MIN-263](https://linear.app/minego/issue/MIN-263). Word acceptance of any regenerated pair stays with the owner.

## Evidence

The comparison uses the local paper corpus, which is kept out of the repository. Only structure was read, from the DOCX XML; no file was rendered.

| Set | Files | What it can show |
| --- | ---: | --- |
| Ministerial final exams, Grade 6 English, 2019 and 2021–2026 (preliminary, first, second and third rounds), reconstructed in Word from the original page images | 23 exams, 23 answer papers | The authoritative ministerial evidence: topology, instructions, item and attempt counts, marks, bilingual text, answer-key shape, page and type |
| Teacher monthly and mid-year papers | 12 exams, 2 answer papers | Variation in school papers |
| Representative set behind the approved layout catalogue (16 September 2026) | 6 exams, 2 answer papers | Already-approved layout decisions |

**Limits.**
- The ministerial originals exist only as page images. The reconstructed Word files are the authoritative copies of those papers and are treated as the evidence here; the images were not re-inspected.
- 2020 is missing.
- One 2019 paper (second round) prints three part marks in a form the extractor could not read; its parts match the other papers.
- Teacher papers follow no single format, so they show variation, not a convention.

## What every ministerial paper shares

Every one of the 23 papers, across eight years and four rounds, has the same shape:

| Slot | Marks | Shown / answered | Content in every or nearly every paper |
| --- | ---: | --- | --- |
| Q1 A | 10 | 6 / 5 | A reading passage with its questions (23 of 23) |
| Q1 B | 10 | 6 / 5 | Textbook knowledge: choice in brackets, True/False or short answers |
| Q2 A | 10 | 6 / 5 | Grammar choice between brackets (22 of 23) |
| Q2 B | 10 | 6 / 5 | Matching List A with List B in a two-column table (22 of 23) |
| Q3 A | 10 | 5 or 6 / 5 | Word box completion, usually with an Arabic instruction (17 of 22) |
| Q3 B | 10 | 5 or 6 / 5 | Vocabulary: matching family words, verbs or jobs, or odd word out |
| Q4 A, Q4 B | 10 each | 1 rewrite; 6 / 5 blanks | Capital letters and punctuation rewrite, and fill-in-the-missing-forms (the two swap order between years) |
| Q5 | 20 | 1 of 2 | Writing: choose A or B, bilingual instruction (23 of 23) |

Total: **100 marks**, Q1–Q4 in A and B parts of 10 marks each, plus Q5 for 20 marks.

Common to all papers:

- **Page and type:** A4 portrait with 0.2-inch margins; Arial for the paper, mostly 10 pt with 9 pt for secondary lines; Times New Roman for the top metadata (23 of 23).
- **Header:** a three-zone header with the issuing authority, a middle zone and the date, round and time (19 papers); 3 papers use two zones. ExamGO never reproduces the issuing authority or its emblem (see Identity below).
- **General note:** a bilingual "Answer all the questions" row under the header (22 of 23).
- **Part headings:** each part is one row: `Q1 A)- instruction`, with its marks `(10 M.)` at the reading end of the row. An Arabic translation of the instruction sits between them when present. 2026 writes the first part as `Q1)A-` and the second as `B-`, which is the same structure.
- **Attempt rules:** printed with the instruction, for example "(5 only)" or "Do 5 only", in English and in Arabic where an Arabic instruction is present. Six items with five answered is the norm.
- **Selected response:** choices sit inline in brackets, `(word / word)` or `(True / False)`, not as lettered options.
- **Matching:** List A and List B sit side by side in a two-column table, with numbers on the left and letters on the right.
- **Answer papers:** one compact table with `Q | Point | Answer` columns (23 of 23).

## What varies and must stay variable

- Which vocabulary task fills Q3 B, which knowledge task fills Q1 B, and whether Q4 A is the rewrite or the blanks.
- Whether a part shows five or six items (Q3 A shows five in 16 papers and six in 6), and whether an Arabic instruction is printed (most often on Q3 and always on Q5).
- The instruction wording within a type, for example "Choose the correct word" against "Choose the correct answer between brackets".
- Teacher papers: a two-zone school header, no bilingual note, Times New Roman or Arial, and smaller monthly totals (10 to 30 marks) with fewer parts.

ExamGO should keep these as choices, not pick one form and present it as the ministry's.

## Specification for ExamGO papers

These rules extend the approved layout catalogue and [the paper format rules](../reference/paper-format-rules.md) (MIN-267). Where the two touch, the format rules win.

1. **Identity.** Keep the current three-cell header: Grade | Test title | School name. Never print the issuing authority, an emblem, a seal or a logo box, and never imply ministry endorsement.
2. **General note.** Offer the bilingual "Answer all the questions" note as the default for exam-length papers. Teachers can turn it off for monthly tests.
3. **Parts.** Number main questions Q1–Q5, with parts A and B. Each part heading is one row: the English instruction, an optional Arabic instruction, then the part total `(10 M.)` at the end. Item numbers restart inside each part.
4. **Marks.** Print each part total only. Never print per-item marks on the student paper (format rules). The paper total is the sum of the part totals.
5. **Attempt rules.** Store and print shown items, required answers and marks separately. Print the rule with the instruction, in both languages when Arabic is shown, for example "(5 only)".
6. **Passage.** Print the passage once as a block, followed by its numbered questions. Never repeat or split it.
7. **Choice.** Print short choices inline in brackets. Use separate lettered options only when a choice is too long for one line.
8. **Matching.** Use a two-column table, List A numbered and List B lettered, with List B shuffled from the saved seed (catalogue rule).
9. **Word box.** Print the box once above its numbered sentences, with the blanks as dotted leaders.
10. **Writing.** Q5 offers A or B, each with its own instruction and an optional Arabic line, and answer space after the chosen task.
11. **Answer key.** Keep the `Q | Point | Answer` reading order of ministerial keys. ExamGO's added columns (Part, Rule, Mark, Total), approved in Phases 8 and 9, stay.
12. **Paper and type.** Keep the approved catalogue values, which match every ministerial paper: A4, 0.2-inch margins, Arial 10 pt for English (9 pt only for secondary lines), Arial 8 pt or larger for Arabic with right-to-left runs, and Times New Roman for top metadata.

## How today's output compares

| Area | Today | Gap |
| --- | --- | --- |
| Header, identity, no per-item marks | Matches (MIN-267) | None |
| Paper topology | New paper prints one question per heading (`Q1)- Answer the following question.`) | No A/B parts, no grouped items, no shown/answered rule. Structured papers (development only) support parts. This is the D8.1 composition question (MIN-251) |
| Bilingual instructions | Supported in structured papers (development only) | New paper has none |
| General note | "Answer all questions." without Arabic | No bilingual row |
| Matching, word box, passage | Supported in structured and complete-exercise papers | Not reachable from New paper |
| Answer key | Extended columns | Matches the agreed extension |

## Hand-offs

- **MIN-263:** a bilingual general note and part-row instructions in New paper output, and parity for compound papers.
- **MIN-251 (D8.1):** a composition model with parts, shown and answered counts, and part totals.
- **Owner:**
  - confirm the default 100-mark exam topology and the monthly variation;
  - choose whether the bilingual note is on by default;
  - review any regenerated pair in Word.
