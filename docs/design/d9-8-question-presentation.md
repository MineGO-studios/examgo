# D9.8 — How each question type looks on the paper

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 30 October 2026 · [MIN-292](https://linear.app/minego/issue/MIN-292)

Status: **specification with an interactive prototype; owner decisions recorded 30 October 2026.** It sets how each question type prints on the student paper and the answer key. It changes no renderer or contract; app rendering belongs to [MIN-263](https://linear.app/minego/issue/MIN-263) and the paper structure to [MIN-295](https://linear.app/minego/issue/MIN-295). Word acceptance of any regenerated pair stays with the owner.

## Evidence

The main reference is the ministerial Grade 6 English final exam, which the owner's Figma *Question formats* examples were drawn from. The local paper corpus stays out of the repository.

| Source | Read as | Used for |
| --- | --- | --- |
| 2026 first round, original page image | Viewed as an image | Every layout convention below |
| 2019, 2022 and 2024 first-round exams, Word reconstructions | Structure only, from the DOCX XML (paragraphs, tables, alignment); not rendered | Confirming the conventions across years and noting variation |
| 2024 first-round answer paper, Word reconstruction | Structure only | Answer-key shape |
| D8.2 paper specification (MIN-256) | Existing document | Paper topology, counts and marks |
| Owner Figma *Question formats*, 30 October 2026 | Viewed in Figma | Type names and input flow |

**Limits.** Only one original page image is on disk; the other years are reconstructions. Fill-the-blanks order and the A/B order inside Q4 vary between years (see *Variation*).

## Shared conventions

- **Question heading.** The first part prints `Q1)A-` followed by the instruction in bold, with the marks `(10 M.)` at the end of the same line. A later part of the same question prints only `B-`, indented. Writing prints `Q5)` with no part.
- **Attempt rule.** When a part shows 6 items and 5 are answered, the English instruction ends with `(5 only)` and the Arabic line ends with `(خمس فقط)`.
- **Arabic instruction.** A bold Arabic line sits under the English instruction, aligned right. Writing and the word box carry their Arabic on the heading line instead.
- **Items.** Numbered `1.` to `6.`, indented under the heading, in regular weight.
- **Choices.** Short choices print inline in brackets with spaced slashes: `( in / on )`, `( True / False )`, `( Yes / No )`.
- **Blanks.** A run of dots, `……….`, inside or after the sentence.
- **Paper content.** English and left to right, including inside the Arabic interface. Only the instruction lines and writing subjects carry Arabic.

## Per type

| Type (owner name) | Student paper | Answer key |
| --- | --- | --- |
| Yes/No Passage · T/F Passage | Heading, Arabic line, the passage as one justified paragraph, then numbered statements | `Yes` / `No` or `True` / `False` per point |
| Choose the correct answer (mixed styles) | Numbered items, each in its own style: a question, a sentence with `( a / b )`, or a statement with `( True / False )` | The chosen word, True/False or the accepted answer |
| Choose the correct answer between the brackets | `1. A doctor works ( at / in ) a hospital.` | The correct choice |
| Match list A with list B | Two columns headed `List (A)` and `List (B)` in bold, centred over their columns. A is numbered `1.`, B is lettered `a.` and shuffled | A letter per point |
| Use the words in the box | The box on its own centred bold line, `{ bad, internet, towels }`, then numbered sentences with a dotted blank | The word per point |
| Fill the blank with missing words or letters | Two columns, numbered across rows (`1.` `2.` / `3.` `4.`): `I, myself ; it, ……….` | The missing word or letters |
| Rewrite with proper punctuation | The sentence on its own indented line, in lower case with no punctuation | The corrected sentence, point `Main` |
| Writing | `Q5) Writing (Choose either A or B):` with `اختر إما A أو B` and `(20 M.)` on the same line; then `A-` and `B-` subjects in bold, each with its Arabic on the right | One `Main` row, marked by the teacher |

## Answer key

One table for the whole paper with three columns, **Q | Point | Answer**:

- `Q` is the question number (`Q2`).
- `Point` is the part and item (`A-1`, `B-6`). A rewrite uses `A-Main` or `B-Main`; writing uses `Main`.
- `Answer` is the word, letter, True/False or Yes/No, or the corrected sentence.

## Variation seen in the sources

- **Fill the blanks order.** The 2026 original numbers across rows (1 2 / 3 4); the 2022 and 2024 reconstructions number down columns (1–3, then 4–6). This specification follows the 2026 original, as the owner decided.
- **Q4 order.** Rewrite and Fill the blanks swap between A and B across years; the type decides the layout, not the slot.
- **Q3 B.** It is either matching (two lists) or a choice in brackets (`use ( glue / a party )`). Both use the layouts above.
- **Item counts.** Some parts show 7 items with `(5 only)` (2026, Q2 A and Q4 A). Counts and attempts follow D8.2 and the paper structure contract.

## Where this is applied

- **Prototype:** the question input prototype ([D9.2, MIN-250](https://linear.app/minego/issue/MIN-250)) previews every type with these conventions, including `B-` headings and the Q | Point | Answer key: https://claude.ai/artifact/9vhBf2AsVTCD9E45KGRM2i
- **App:** not yet. The app's paper review mirrors the generated Word files exactly (D8.3) and today prints one question per number without parts, for three types. Applying this specification needs the paper structure (MIN-295) and renderer (MIN-263) first, so the preview and the Word file stay identical.

## Owner decisions (30 October 2026)

- **Fill the blanks order:** across rows, as in the 2026 original (`1.` `2.` / `3.` `4.`).
- **Writing in the answer key:** one `Main` row marked by the teacher. No model answer is printed for any writing subject.
