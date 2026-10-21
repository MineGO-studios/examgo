# Save, error and recovery states (D9.6)

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 21 October 2026. Tracker: [MIN-258](https://linear.app/minego/issue/MIN-258). Technical counterpart: [MIN-262](https://linear.app/minego/issue/MIN-262).

## 1. Audit of existing behaviour

These cases are already handled and covered by browser tests. They are kept as they are.

| Case | Behaviour | Test |
| --- | --- | --- |
| Failed draft save | The teacher's paper and review are kept, and an alert says the save failed. Retry saves once, with no duplicate row. | `failed save preserves reviewed intent…` |
| Export failure | Both prepared documents are kept. "Retry failed download" sends the same bytes again. | same test |
| Expired session | The same account resumes the unsaved work in the tab; another account discards it. | `expired session resumes…` / `…discards intent for another account` |
| Duplicate finalize (response lost) | Retrying the unchanged request returns the same sealed paper, never a second one. | `grouped preset finalization survives a lost response…` |
| Failed server sign-out | The local session is cleared, and the failure stays visible with what to do next. | `a failed server sign-out remains visible…` |
| Interrupted import | The confirmed column mapping is kept, and the same batch is retried. | `interrupted intake preserves confirmed mapping…` |
| Repeated clicks | Actions are disabled while busy (`isBusy`). Finalization uses a request ID, so it is idempotent. | covered inside the tests above |
| Error details | Teacher wording comes first, with a short support reference. Private content and credentials are never shown. | `safeErrorDetails` unit tests |

## 2. Gap found

Validation on the New paper setup form showed each field message as its own alert, so several problems were announced at once. The messages sat inside their labels, which changed a field's spoken name to, for example, "Test title Test title is required.". Nothing listed the problems or moved focus to them. This is the gap the GOV.UK error-summary pattern addresses.

## 3. State rules

- **Saving:** the action's button is disabled and its label says what is happening (for example "Saving…"). There is no spinner without text.
- **Saved:** a polite status names what was saved and where ("Exam draft saved").
- **Failed:** an alert says what failed, that nothing was lost or changed, and the next step. The entered work stays, and Retry repeats the same request.
- **Invalid input:** an **error summary** appears at the top of the form and takes focus. It lists each problem as a link to its field, and choosing a link focuses the field, opening "More options" first if needed. Each field keeps its message beside it, linked with `aria-describedby` and outside the label. Only the summary is announced. Fixing the problems and submitting again removes the summary.
- **Never** a false success, and never a silent loss of input.

## 4. Delivered in the application

- `ErrorSummary` (`src/components/ErrorSummary.tsx`).
- The New paper setup form uses it for school name, test title, teacher name, question count and selection number. Field messages are linked by `aria-describedby` and are no longer separate alerts or part of the label.

## 5. Not yet covered

- Applying the summary to the question form, the Iraqi exercises form and the presets form.
- New persistence, authorization or retry logic (MIN-262).
