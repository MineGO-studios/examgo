# Paper format rules

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · effective requirement: 21 October 2026.

These shared rules apply to every newly generated student paper and matching answer key, including exports regenerated from saved papers. They are presentation rules, independent of question type, bank, paper builder, snapshot schema and mark allocation. Implementation is currently an uncommitted candidate; the existing hosted Preview has not been updated.

## Header identity

The grade occupies the former school-name position; the school name occupies the former grade position. The current standard three-cell header reads **Grade | Test title | School name**. Apply the same placement in student and key documents and their content previews. Preserve title, identity values, teacher footer, direction, cell dimensions and the surrounding template structure.

Historical template shapes retain their surrounding title/layout structure while exchanging the school and grade fields. New templates must preserve this field ordering and provide an unambiguous identity header. Do not swap the stored school and grade values to achieve a visual result.

## Marks on student papers

Do not print a mark beside each individual question, point, blank, matching entry or writing alternative. Labels such as `(2M)` are omitted, including when point allocations differ.

Keep the applicable section/branch total and the paper total wherever that format already prints them. Keep answer instructions and displayed/attempted counts. A six-question exercise requiring five answers at two marks each retains its ten-mark total.

This changes presentation only. Teachers still assign and review marks in the editor. The answer key retains exact question/point marks, attempt rules and totals, including unequal allocations. Do not replace unknown marks with zero, redistribute marks, change answers or mutate a saved snapshot to hide a label.

## Saved papers and prior evidence

Existing downloaded files remain unchanged. New exports use the current presentation rules with the captured content, order, identity and scoring. A regenerated file is a new artifact with its own hash and Word review. Prior one-page or visual acceptance never transfers automatically.

Original template files, content revisions, saved snapshots and historical evidence retain their recorded identity. Template/schema versions remain separate from product and presentation checkpoints. No migration is needed for this presentation change.

## Maintenance and verification

All three production rendering entrypoints use the shared template preparation: simple papers, source-specific papers and compound papers. The compound path also serves complete presets, structured/blueprint papers, complete-paper candidates and reviewed exercises; their existing availability limits remain unchanged. Content previews follow the same header and student-mark rules. Mark-editing controls and answer-key scoring remain visible.

Any new renderer or template must satisfy this reference. Verify student/key identity, header placement, absence of generated point labels, retained totals/answer-key marks, source order, options and full linked context through the production rendering path. Preserve template/package safety checks. Structural tests do not prove Word pagination; human inspection applies to the exact regenerated pair.

Canonical tracking: [MIN-267](https://linear.app/minego/issue/MIN-267). The [Phase 16 checkpoint](../phase-16/paper-format-rules-2026-10-21.md) records source identity, tests, artifacts, original human acceptance and owner Word acceptance of the six revised fixture files. Other generated artifacts and a future hosted build retain their own acceptance requirements. Linear owns live status.
