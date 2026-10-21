# School and exam-name presets (D9.4)

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 21 October 2026. Tracker: [MIN-252](https://linear.app/minego/issue/MIN-252). Technical counterpart: [MIN-261](https://linear.app/minego/issue/MIN-261). Builds on the Settings structure in [d9-3-settings.md](d9-3-settings.md).

Status: **specification and prototype for owner review.** Nothing in this document is wired into the application. Saved values need account storage, which MIN-261 owns.

## 1. Today

Each new paper starts with empty **School name**, **Test title** and **Teacher name for footer** fields (80 characters each). A teacher who sets ten papers a term retypes the same school and the same few exam names every time. Nothing is remembered between papers, and nothing is stored per account.

## 2. What the teacher gets

1. **A school-name default.** In Settings, under "Paper defaults, saved to your account". Every new paper starts with it filled in.
2. **A teacher-name default** for the footer, in the same section (the D9.3 design).
3. **Saved exam names.** A list the teacher maintains in Settings, for example "Monthly test 1", "Mid-year exam" or "Quiz — Unit 3".
4. **A searchable Test title** in paper setup that suggests saved names as the teacher types.

The values belong to the signed-in teacher. Another teacher on the same device never sees them (section 7).

## 3. Settings: Paper defaults

The section appears only once MIN-261 provides account storage. It has an explicit save model because the values are account data, not device choices (D9.3, section 4).

| Field | Behaviour |
| --- | --- |
| Default school name | A text field. Empty means new papers start empty. |
| Default teacher name for footer | A text field. Empty means papers print a line for handwriting, as today. |
| Saved exam names | A list. Each row shows the name and two quiet actions: **Rename** and **Remove**. An **Add exam name** field with an **Add** button sits under the list. |

**Save model:**

- The two default fields share one **Save defaults** button. It stays disabled until something changes. **Cancel** returns to the last saved values.
- States: "Saving…", then "Saved", or "Couldn't save. Your changes are still here. Try again", with a Retry button and the typed values kept.
- Each exam-name action saves on its own, because each is small and reversible:
  - **Add:** the name appears in the list with "Saving…", then settles. On failure the row shows "Not saved" with Retry and Discard, and the typed name stays.
  - **Rename:** the row turns into a field with Save and Cancel; Enter saves and Escape cancels.
  - **Remove:** the row is replaced by "Removed "Mid-year exam". Undo" for the rest of the visit. There is no confirmation dialog, because Undo is cheaper and removing a name never changes an existing paper (section 6).

**Validation:**

- **Blank:** a name that is empty after trimming is refused with "Enter a name".
- **Length:** up to 80 characters, the same limit as the paper's Test title. A longer name is refused with "Use 80 characters or fewer".
- **Duplicates:** compared after trimming, collapsing spaces and ignoring case, using the same Arabic normalisation as search (section 5). A duplicate is refused with "You already have "Monthly test 1"", and that row is highlighted.
- **List size:** at most 100 names, a ceiling MIN-261 may adjust. At the limit, Add is disabled with "You have 100 saved names. Remove one to add another".

**Empty list:** "No saved exam names yet. Add the names you use every term, such as Monthly test 1."

## 4. Paper setup: the Test title field

The Test title becomes an **editable combobox** that filters as the teacher types. It follows the W3C APG combobox pattern with list autocomplete and no automatic inline completion. The research question R6 asks whether typing selects, filters or creates. The answer is a separate rule for each:

| The teacher | Result |
| --- | --- |
| Types | Filters the suggestions. The typed text **is** the title for this paper. Nothing is saved to the list. |
| Picks a suggestion | Fills the field with that name. The teacher can still edit it for this paper. |
| Picks **Save "…" to my exam names** | Adds the typed text to the saved list. This option appears at the end of the list only when the text is not blank and matches no saved name. It is the only way the field creates a saved name. |

**Keyboard:**

- **Down arrow** opens the list and moves to the next option; **Up arrow** moves back. Alt+Down opens the list without moving.
- **Enter** picks the highlighted option. With nothing highlighted, Enter does nothing special.
- **Escape** closes the list and keeps the typed text. It never clears the field.
- **Tab** closes the list and moves on without picking.
- Focus stays in the text field throughout. The highlighted option is announced through `aria-activedescendant`, and a polite status reads "4 saved names match".

**Touch and pointer:**

- A 44-pixel chevron button at the inline end opens and closes the list.
- Options are at least 44 pixels tall.
- A tap outside closes the list.
- On a phone the list opens below the field and scrolls within itself; the page does not jump.

**Suggestions:**

- Saved names that contain the typed text, matched anywhere in the name, with the matching part in bold.
- Up to 8 are shown, with the list scrolling for more.
- With an empty field, the list shows all saved names in the teacher's order.

**States:**

- **No saved names:** the field behaves as a plain text field and shows no chevron. A hint under it reads "Tip: save the exam names you reuse in Settings."
- **No match:** "No saved name matches." followed by the **Save "…" to my exam names** option.
- **Loading:** the field works at once. The list shows "Loading your saved names…" until they arrive, and typed text is never replaced when they do.
- **Couldn't load:** the field works as a plain text field with "Your saved names couldn't load. You can still type a title." No retry spinner blocks the form.
- **Save from the field fails:** the title stays on the paper, and the status reads "Couldn't add to your saved names. The title is kept on this paper." with Try again.

**School name and teacher name** stay plain text fields. A new paper starts with the account defaults filled in, and a short hint, "From your settings", links to Settings. Editing the field changes this paper only. A paper never writes back to the defaults silently.

## 5. Search and names in both languages

- **Display:** names are shown exactly as the teacher typed them. Normalisation is for matching only and never changes a stored name.
- **Matching:** case-insensitive, with spaces collapsed. For Arabic, matching also ignores harakat and tatweel, and treats أ, إ and آ as ا, ة as ه, and ى as ي. So "اختبار شهري" finds "إختبار شهري".
- **Direction:** each name is shown in its own direction (`dir="auto"`), so a mixed list of Arabic and English names reads correctly in either interface language. The paper's title field itself keeps its current left-to-right setting, because paper content is English (examgo-design).
- **Digits:** Western digits throughout, matching the app copy.
- **Long names:** an 80-character name wraps onto two lines in the list and is never cut off.

## 6. Historical papers

- A paper stores the school name, title and teacher name it was made with, as it does today.
- Renaming or removing a saved name, or changing a default, never rewrites a saved draft or a finalized paper. Regenerating a finalized paper uses its stored values.
- A draft reopened later keeps its own values. Defaults apply only when a new paper is started.

## 7. Account isolation

- Defaults and saved names are loaded for the signed-in teacher only, and dropped from memory on sign-out or account change (D9.3, section 4).
- Nothing in this feature uses browser storage, so a shared device never carries one teacher's names to another.
- The server enforces ownership (MIN-261). The interface never relies on hiding values.

## 8. Accessibility checklist for implementation

- A real `<label>` on every field. The combobox has `role="combobox"`, `aria-expanded`, `aria-controls` and `aria-autocomplete="list"`; the list has `role="listbox"` with `role="option"` items.
- A visible focus ring on the field and on the highlighted option. The highlighted option is shown by more than colour, using a background and an inline-start bar.
- The status for the match count and for save results is announced politely, never as an alert.
- The list and the Undo row work at 200% zoom and at 320 pixels wide without sideways scrolling.
- Under reduced motion, the list appears without sliding.

## 9. Prototype

A clickable prototype covers the Settings "Paper defaults" section and the paper-setup Test title. It has controls for four data states (a typical list, an empty list, long and bilingual names, and a failing save), for English or Arabic, and for light or dark. It uses sample data only and is not wired to the application. Location: the published prototype artifact linked from MIN-252. Its source is kept outside the repository.

**Checks performed (Playwright, prototype layer only, 21 October 2026):**

- Flows walked:
  - in the combobox, typing to filter, arrow keys and Enter to pick, Escape keeping the text, and the no-match option to save a name;
  - a saved default leaving the open paper unchanged, then applying to the next new paper;
  - duplicate and blank names refused;
  - remove with Undo;
  - every state: empty list, long and bilingual names (Arabic, 390 pixels), and failing saves (the typed values are kept).
- Arabic matching: "اختبار شهري" finds "إختبار شهري أول".
- No horizontal overflow at 390 or 1280 pixels, in light and dark.
- axe WCAG 2.1 A/AA: 0 violations in every state checked, including the open list and the error states.
- Reduced motion was emulated. No script errors.

One fix came from review: in Arabic the chevron overlapped the left-to-right title text, so it now sits on the field's physical right.

Prototype checks are not teacher usability evidence and not runtime acceptance.

## 10. Handoff and limits

- **MIN-261:** account storage for the two defaults and the saved list, owner-only access, the list ceiling, and the server-side duplicate rule matching section 3.
- **UI wiring:** a scoped follow-up after MIN-261, using this specification. It adds the Settings section, the combobox and the "From your settings" hint, with unit and Playwright coverage for each state in sections 3 and 4.
- **Not in scope:** sharing names between teachers, school-wide lists, and importing names.
