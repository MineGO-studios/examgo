# Question-type vocabulary and authoring (D9.1)

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · draft v0.1, 21 October 2026. Tracker: [MIN-249](https://linear.app/minego/issue/MIN-249).

Status: **specification and first interface slice delivered for owner review** (section 8). Sections 1 to 3 are read from the current source. No contract, schema or output changes.

## 1. Canonical types in the current source

`src/domain/questionDomain.ts` defines nine response types. Each has its own content and answer shape.

| Canonical type | What the student does | Answer stored |
| --- | --- | --- |
| `multiple-choice` | Chooses one option | `correctOptionLabel` |
| `binary` | Marks true/false or yes/no (`labelMode`) | `isTrue` |
| `short-answer` | Writes a short answer on lines | `canonicalAnswer`, approved variants, case rule |
| `completion` | Fills blanks in a text, optionally from a word bank | an answer per blank |
| `odd-word` | Picks the word that does not belong | `oddWord` |
| `matching` | Matches List A with List B | pairs of left and right IDs |
| `word-relationship` | Writes the related form of a word pair | accepted answers |
| `rewrite` | Rewrites a sentence by an instruction (punctuation, capitals) | accepted answers |
| `extended-writing` | Writes a composition | rubric criteria, model answer, manual marking |

**Found inconsistency.** The same type has different labels on different screens:

| Type | Question form | Bank browser | Builder (simple / structured) |
| --- | --- | --- | --- |
| short-answer | Short answer | Short open answer | Short open answer / Short answer |
| completion | Word bank | Word-bank completion | — / Word-bank completion |
| odd-word | Odd word | Odd-word selection | — / Odd word |
| matching | Matching | Match List A and List B | — / Match List A and List B |
| word-relationship | Word relationship | Word relationship / transformation | — / Word relationship |
| rewrite | Rewrite | Punctuation / capitalization rewrite | — / Punctuation / capitalization rewrite |
| extended-writing | Writing | Extended writing / composition | — / Writing |

## 2. Support matrix today

Key: ✓ supported · — not supported · dev = development builds only.

| Type | Author in a bank | Import | Pick by type | Approved exercise | Iraqi exercises | Paper output |
| --- | --- | --- | --- | --- | --- | --- |
| Multiple choice | ✓ | ✓ JSON, Papers CSV, legacy CSV, mapped CSV | ✓ | ✓ (complete groups) | — | ✓ simple and grouped renderers |
| True/False or Yes/No | ✓ | ✓ JSON, Papers CSV, mapped CSV | ✓ | ✓ | — | ✓ |
| Short answer | ✓ | ✓ JSON, Papers CSV, mapped CSV | ✓ | ✓ | — | ✓ |
| Word-bank completion | ✓ | ✓ JSON, Papers CSV | — | — | ✓ (one five-blank record) | ✓ Iraqi-exercises renderer |
| Odd word | ✓ | ✓ JSON, Papers CSV | — | — | ✓ (six records) | ✓ Iraqi-exercises renderer |
| Word relationship | ✓ | ✓ JSON, Papers CSV | — | — | ✓ (six records) | ✓ Iraqi-exercises renderer |
| Rewrite | ✓ | ✓ JSON, Papers CSV | — | — | ✓ (one record) | ✓ Iraqi-exercises renderer |
| Writing | ✓ | ✓ JSON, Papers CSV | — | — | ✓ (two alternatives) | ✓ Iraqi-exercises renderer |
| Matching | ✓ | ✓ JSON, Papers CSV | — | — | — | dev only (complete-paper candidate) |

The grouped preset renderer explicitly rejects any type other than multiple choice, true/false and short answer ("Unsupported grouped renderer type"). That is the contract's explicit unsupported state, not a silent conversion. The mapped "Other CSV" import columns cover the standalone fields. The exact per-type coverage of CSV column mapping needs a technical readback before the chooser promises it (handed to MIN-260).

## 3. Passages and linked exercises

- **A passage is shared context, not a response type.** It has a title, an instruction (with an optional Arabic instruction), passage text of 1 to 5,000 characters, an attempt count, and an ordered list of child questions. Each child keeps its own canonical type, so one passage can mix multiple choice, true/false and short answers.
- **Contextual and standalone questions differ.** The bank browser marks a child as "In a passage or exercise". Contextual children only enter a paper with their complete passage. Standalone pickers, such as Pick by type, use standalone questions only.
- **Word-bank completion is a response type.** A word bank belongs to its completion question, not to a passage.
- **Preserved as they are:** choose-from-brackets wording, mixed groups and source variants are kept as authored. The vocabulary renames nothing in stored content.

## 4. Proposed teacher vocabulary

There is one label per type, used on every screen. The Arabic labels need review by a native-speaking teacher, as all Arabic strings do.

| Canonical | English | Arabic |
| --- | --- | --- |
| multiple-choice | Multiple choice | اختيار من متعدد |
| binary | True/False or Yes/No | صح/خطأ أو نعم/لا |
| short-answer | Short answer | إجابة قصيرة |
| completion | Fill in from a word bank | إكمال من بنك كلمات |
| odd-word | Odd word out | الكلمة المختلفة |
| matching | Match List A with List B | مطابقة القائمة أ بالقائمة ب |
| word-relationship | Word relationship | علاقة الكلمات |
| rewrite | Rewrite (punctuation and capitals) | إعادة الكتابة (الترقيم والحروف الكبيرة) |
| extended-writing | Writing | الكتابة |
| passage group | Passage | قطعة قراءة |

## 5. Type chooser (question form)

The form has nine types, which is above the five-option limit (D6.1), so the chooser is a single dropdown grouped by what the student does:

- **Choose the answer:** multiple choice, true/false or yes/no, odd word out, match List A with List B.
- **Write the answer:** short answer, fill in from a word bank, word relationship, rewrite, writing.

Under the dropdown, one line says where the chosen type can be used today, taken from the matrix in section 2:

- "Used in: Pick questions by type" for multiple choice, true/false and short answer;
- "Used in: Iraqi exercises and writing" for completion, odd word, word relationship, rewrite and writing;
- "Not in hosted papers yet. You can still save it in your bank" for matching.

Changing type keeps the existing form behaviour; this design adds no conversion between types.

## 6. Interface work possible now

All of this is client-side, with no contract change:

1. one shared label module (English and Arabic) used by the question form, bank browser, builders and cards;
2. the grouped type chooser with its "used in" line.

Type-specific form layouts are D9.2 (MIN-250). Count feasibility and new type support belong to MIN-260.

## 7. Open points for the owner

- Confirm the English labels in section 4, especially "Fill in from a word bank" and "Odd word out".
- Confirm that matching should say "not in hosted papers yet", rather than hiding it from the chooser.

## 8. Delivered in the application (21 October 2026)

- **`src/lib/questionTypeLabels.ts`:** one English and Arabic label per canonical type, the chooser groups, and where each type is used.
- **Shared labels on every screen:** the question form, bank browser and cards, simple and structured builders, the shared-questions preset flow, the coverage summary and the import preview.
- **Grouped chooser:** the question form's chooser is a grouped native dropdown. A visible "used in" line under it is linked to the dropdown with `aria-describedby`, and matching states "Not in hosted papers yet".
- **Section legends:** the type-specific form sections use the same labels.

**Verification:**

- vitest: 606 passed, 6 skipped. This includes the new label tests: every type is named in both languages, every type sits in exactly one group, the use line covers the unsupported case, and an unknown stored type stays visible.
- App and e2e TypeScript, and lint: pass.
- Design detector: 0 findings.
- Playwright: 31/31, including the new `local-question-types.spec.ts` (groups, use line, matching state, axe).
- Checked in the running application (Question banks, then Add question).

The Arabic labels are not yet shown on screens that are still English-only. The full Arabic interface is MIN-56. The per-type CSV column-mapping readback is handed to MIN-260.
