# System and compatibility reference

Applies to: `1.0.0-alpha.1`

Last reviewed: 20 October 2026

## Purpose and boundaries

ExamGO constructs teacher-reviewed student papers and matching answer keys from question-bank content. It does not provide student accounts or automated grading as part of the documented Alpha scope.

The frontend uses React, TypeScript and Vite. Supabase provides authentication and persistence with account/role boundaries. Browser-side document generation creates editable DOCX files through shared validation and rendering contracts.

## Content model

A canonical question has a stable identity, typed content/answer, curriculum placement and revisions. Bank memberships organize collections without copying questions.

Nine authorable question types are represented: multiple choice, binary, short answer, completion, odd word, matching, word relationship, rewrite and extended writing. Shared passage/exercise groups preserve context, ordered members and structural rules. Type authoring support does not imply selection support in every paper format.

Imported source marks are not automatically the marks for a new exam. Exam-owned marks and displayed/attempted rules must validate together. Unknown content or approval is not silently invented.

## Saved work and document generation

Editable drafts/configurations and immutable finalized papers serve different purposes. A finalized paper captures exact content revisions, settings, order and scoring so later source changes cannot rewrite the original result.

Student and key output share the same validated content authority. Answer mapping, question order, group context and marks must agree. Export retries must not select a new paper silently.

The [shared paper format rules](paper-format-rules.md) govern presentation for every new export, including regeneration from saved content. Individual mark labels are omitted from student points while answer-key scoring remains intact. Presentation changes do not rewrite captured content or earlier downloaded files.

## Compatibility surfaces

Product versions describe application checkpoints. Import envelope versions, typed domain/schema versions, database migration identifiers, renderer/template versions and saved snapshot versions remain independent. Never renumber or rewrite them merely because the product version changes.

Before changing an existing compatibility surface, document existing readers, new validation, migration/recovery needs and historical regeneration behavior. Explicitly report breaking changes.

The [import contract](../imports/phase11-interchange-contract.md) is the detailed reference for supported adapters, mapping, limits, groups and retries. The [architecture decision](../architecture/adr-0001-question-domain-and-snapshots.md) records the earlier identity/snapshot rationale; actual code and later evidence determine implementation.
