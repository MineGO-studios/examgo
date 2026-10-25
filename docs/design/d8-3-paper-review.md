# D8.3 — Paper-shaped review and the student and key views

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 23 October 2026 · [MIN-255](https://linear.app/minego/issue/MIN-255)

Status: **delivered for owner review** in the New paper flow, within the accepted approach of MIN-41 and MIN-42: synchronized HTML content previews without page boundaries, browser-built Word files, and Word or LibreOffice as the layout authority.

## The review surface

The paper is the review. It shows the same header, numbering, instructions, marks and answer spaces the Word file uses, from the same template data (`buildExamData`, `buildAnswerKeyData`):

- **Paper plan** above the paper: one bar by question type, sized by marks (D8.7).
- **Student paper / Answer key** switch. The student paper never shows answers.
- **Targeted changes** in the "check your answers" pattern, so a change never sends the teacher back through the whole setup:
  - **Question:** the pen on a question opens its tools (lock, replace, remove, marks); only the focused question shows them.
  - **Header:** the pen above the header focuses the Test title field in the paper details.
  - **Footer:** the pen beside "Teacher:" focuses the teacher name field.
  - **Answer key:** each row's question number opens that question on the student paper.
- **Generate** shows the Word files themselves before download (D8.8).

The interface tools inside the paper keep the interface language and direction; the paper stays English and left to right.

## Fidelity contract

| Surface | What it is | What it promises |
| --- | --- | --- |
| Content preview (the paper on screen) | HTML from the production template data | The same content, order, numbering and marks as the files, in a paper-like layout. It does not show page breaks and says so: "Content preview. Page breaks and Word layout are not shown." |
| Word preview (after Generate) | The exact generated files, rendered in the browser | The same bytes the teacher downloads. Word may break pages slightly differently, and the preview says so. |
| Word or LibreOffice | The downloaded files | The layout authority. Human acceptance belongs to the exact downloaded pair. |

Edits in review clear any generated files, so the Word preview and downloads always match the paper on screen.

## Verification

- **E2e:** the change links focus their fields; the key row opens its question on the student paper; the key view shows no question tools; axe passes.
- **Suites:** vitest 647 passed / 6 skipped; Playwright 60/60; Arabic at 390px checked visually in the right-to-left sweep.

## Not in this slice

- **Structured and preset papers:** they keep their own review screens until the D8.1 parts model is wired (MIN-295).
- **Renderer parity:** parts, the bilingual note and Arabic part instructions belong to MIN-263.
