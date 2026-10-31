# D9.2 — Question input: entering each question type

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 31 October 2026 · [MIN-250](https://linear.app/minego/issue/MIN-250)

Status: **accepted design, prototype only.** The owner accepted prototype version 11 on 30 October 2026 ("all looks good now"); version 12 adds the D9.8 paper conventions. Nothing here is wired into the app. Wiring needs the question contracts in [MIN-260](https://linear.app/minego/issue/MIN-260) and gets its own follow-up once they exist. The prototype is shared with the owner separately: https://claude.ai/artifact/9vhBf2AsVTCD9E45KGRM2i

## Sources

- The owner's Figma file *Question formats* (30 October 2026): the input flow of each type, its type name and the question and part it is suggested for.
- The ministerial papers (D8.2) for how each type prints, specified in D9.8 ([MIN-292](https://linear.app/minego/issue/MIN-292)).
- The type names applied in D9.1 ([MIN-249](https://linear.app/minego/issue/MIN-249)).

## Owner decisions

All made on 30 October 2026. The owner may adjust them later.

| Decision | Choice |
| --- | --- |
| Entry model | **One at a time**, chosen from five skill-led directions (On the sheet, Inspector, Ledger, One at a time, Two sheets) |
| Field layout | Each item is one line in paper order inside its card, never a stack of fields; it wraps like text on phones |
| Brackets | Ticking the correct choice works as designed |
| Yes/No and True/False | Separate types |
| Writing | Each subject has an optional Arabic line on the paper |
| Page width | The editor and the whole app use the window width (merged in PR #4) |
| Current line on the paper | Marked like a highlighter (Marker), chosen from five styles |

## The screen

1. **Question settings card.** Question (Q1–Q6), part (A–D), question type, marks and the instruction on the paper.
   - Choosing a question and part selects its suggested type, and the suggestions sit at the top of the type list; every type stays available.
   - Marks start from the Settings default and are never fixed.
   - Writing fixes the part to "A, B".
2. **Step row.** One numbered step per item, with a dot when the item is complete, and a + to add one.
   - Writing uses A and B.
   - Passage types and Use the words in the box start with a Passage or Box step, because these come first on the paper.
3. **Item card.** One item at a time, laid out as its paper line, with Previous, remove, and Next. On the last item Next becomes Add.
4. **Paper.** Beside the card on wide screens and below it on phones.
   - It shows the student view or the answer key, following D9.8.
   - The current line is marked with an amber highlighter stroke, and selecting a line opens that item.

## Shared rules

- **Items:** 1 to 6 per part. At 6 items "(5 only)" and "(خمس فقط)" are added automatically; Rewrite and Writing are excluded.
- **Offers after a pause:** when the teacher stops typing for 1 second, the line offers the next step at its end:
  - "( ) Add choices" in a Brackets line;
  - "…… Insert blank" in Use the words in the box and Fill the blank.
  - An item that already has text when it switches to Brackets gets the offer at once.
- **Text after:** text that follows the brackets or the blank starts as a "Text after" button and becomes a field when pressed. Existing text shows as a field.
- **Missing answers:** an item without an answer shows "Answer not set" and has no done dot, and its answer-key row shows "—".
- **Fields:** each field sizes to its text. Paper content is English and left to right, including in the Arabic interface.

## Per type

| Owner type | Suggested for | One-line layout | Answer set by |
| --- | --- | --- | --- |
| Yes/No Passage | Q1 A | Passage step, then: statement, then **Yes** / **No** | Pressing Yes or No |
| T/F Passage | Q1 A | Passage step, then: statement, then **True** / **False** | Pressing True or False |
| Choose the correct answer (mixed styles) | Q1 B | Four tiles choose each item's style (Brackets, True/False, Yes/No, Answer), then the line for that style. The instruction is one of the six ministerial wordings | As for each style |
| Choose the correct answer between the brackets | Q2 A | `text before ( choice ✓ / choice ✓ + ) × text after`, with 2 to 4 choices | Ticking one choice |
| Match list A with list B | Q2 B, Q3 B | `List A item → its match in List B` | The pair itself; List B is shuffled on each paper |
| Use the words in the box | Q3 A | Box step (up to 8 words), then: `sentence [blank] × text after`, with the box words below as buttons | Picking a box word for the blank |
| Fill the blank with missing words or letters | Q4 A | `given example ; example to complete [missing part] × text after` | Typing the missing letters or word |
| Rewrite with proper punctuation | Q4 B | The sentence written correctly; once typed, a checkbox removes capitals and punctuation from the student copy and shows what students see | The sentence as typed |
| Writing | Q5 A, B | `subject` with its optional Arabic line; A and B, at most 2. With one subject the heading drops "(Choose either A or B)" | Teacher review; no model answer |

## Behaviour on change

- **Type change:** each type keeps its own items while the teacher switches types, so switching back restores them.
- **Mixed style change:** keeps the item's text. Switching to Brackets offers the choices.
- **Remove brackets / remove blank:** clears only the choices or blank, its answer and its text after, and returns focus to the sentence.
- **Removing a box word:** clears every blank that used it ("Answer not set"). Words after it keep their answers.
- **Remove item:** moves to the nearest item. A part keeps at least one item.

Saving, discarding and error recovery are not in the prototype. When the forms are wired they follow D9.6 (save, error and recovery states): keep the teacher's input, link each error to its field, and confirm before discarding incompatible fields.

## Accessibility and language

- Every control has a visible or accessible name. Answer buttons and tiles expose `aria-pressed`, the steps expose `aria-current="step"`, and the offers appear in a `role="status"` region.
- Focus moves to the next field after an action (Add choices to the first choice, Insert blank to the word picker or missing-part field, Text after to its field) and returns to the same control after a re-render.
- Touch targets are at least 44px. Reduced motion turns off the offer animation.
- English and Arabic interface. Paper lines, the word box and the choice rows stay left to right in Arabic, and the Writing Arabic line is right to left.

## Verification (prototype, 30 October 2026)

Playwright across all 9 types on the setup step and item 1, in the student and answer-key views:

- **Matrix:** 1440, 390 and 320 px; English and Arabic; light and dark; reduced motion.
- **axe (WCAG A/AA and best practice):** 0 violations.
- **Layout:** no horizontal scroll.
- **Errors:** no page errors.
- **40 flow checks**, including:
  - step navigation and type suggestions;
  - the 1 s bracket and blank offers, the word pick and the "Text after" button;
  - "(5 only)" and the 6-item limit, mixed tiles with the ticked answer in the key, and selecting a paper line;
  - the shuffle, rewrite stripping, and the writing part, heading, Arabic line and single subject;
  - 7 checks that each type's line stays on one line at 1440 px;
  - 6 checks of the D9.8 paper conventions.

This is prototype evidence only. It does not show app behaviour, saving or contract validity.

## Handed to the question contracts (MIN-260)

The prototype implies these content shapes. Each must exist in the canonical contracts before wiring:

- **Brackets:** a multiple-choice stem with text before and after the inline choices, 2 to 4 choices, and one correct choice.
- **Passage types:** a passage group with binary children and the label mode (Yes/No or True/False).
- **Mixed:** a group whose children keep their own types (multiple choice in brackets, binary, short answer).
- **Matching:** ordered pairs; List B order is set per generated paper.
- **Use the words in the box:** completion with a shared word bank of up to 8 words and one blank per sentence, with text before and after the blank.
- **Fill the blank:** word relationship with a given example, an example to complete and the missing part, which may be letters inside a word.
- **Rewrite:** the corrected sentence stored once, with the student line derived by removing capitals and punctuation.
- **Writing:** two alternatives with an optional Arabic line each and no model answer.
- **Parts:** question, part, suggested type and marks belong to the paper structure (MIN-295).
