# Documentation and versioning policy

Effective: 20 October 2026

Initial checkpoint: `1.0.0-alpha.1` — Alpha 1

## Official documentation

[The documentation index](../README.md) is the maintained entry point. Write for the reader and link to existing contracts, decisions and operational evidence instead of copying them into multiple competing documents.

Use task guides for actions, reference for exact rules/limits, explanation for concepts and decisions, and a worked tutorial when a new user needs a complete learning path. Keep long technical evidence separate from everyday teacher instructions.

Use plain product language, descriptive sentence-case headings and concrete examples. Omit authoring-tool credits, generated-by labels, chat transcripts and promotional filler. Preserve required licenses, original source attribution, security evidence and educational/visual acceptance records. Internal work records remain separate from product documentation.

## What each change must document

| Change | Required documentation review |
| --- | --- |
| Major feature or changed behavior | Purpose, available workflow, inputs, results, limits, recovery, user guide/reference and changelog |
| UI/UX change | Visible behavior, terminology, accessibility/responsive implications and affected guide; observe the existing UI/UX permission boundary |
| Import, domain or persistence contract | Supported shape, validation, groups/answers/marks, compatibility, authorization, retry and recovery |
| Migration or operational change | Exact target, prerequisites, approval, execution, validation, rollback/recovery, owner and known limits |
| Configuration/dependency change | Setup requirements, safe examples, compatibility and verification; never document secrets |
| Curriculum/content change | Actual eligible coverage, review/source authority, incomplete supply and affected output checks |
| Phase completion | Version-labelled checkpoint, delivered scope, evidence and limits, remaining work and live tracker link |
| Documentation-only task | Update affected material and record the current product version; do not invent a software release |

Every contributor must perform this review in the same task as the change. If an area is unaffected, record a short reason in the internal completion evidence; do not create empty manuals or duplicate pages.

## Product version authority

`package.json` is the machine-readable product version. The root version and root package entry in `package-lock.json` must match. The documentation index, README, current release/checkpoint note and changelog must identify the same current version.

The initial label is `1.0.0-alpha.1`. It targets an eventual first stable `1.0.0`; the prerelease suffix makes the current version unstable. It is not stable V1.

Before closing each major feature or phase, record its product version and a named checkpoint. For an accepted application increment, advance the prerelease counter, for example `1.0.0-alpha.2`, and add its checkpoint note and changelog entry. A smaller unfinished task stays under Unreleased until the checkpoint is accepted. Multiple related tasks may share one checkpoint.

A phase containing only documentation/research can retain the current app version but must identify it in its dated phase/change record. Phase numbers, issue IDs and release versions are not interchangeable. Do not rename an internal Builder V2 feature or an existing schema to make the numbers match.

Do not backfill invented version numbers onto old accepted artifacts. Their original revision, hashes and evidence remain their identifiers. A deployed or published version is immutable; changed builds receive a new version. Release notes distinguish local checkpoint, tested artifact and deployed/released artifact.

## Lifecycle labels

| Stage | Meaning and promotion rule |
| --- | --- |
| Alpha | Early controlled use, unfinished validation and known documented limits |
| Beta | The agreed core workflows are stable enough for broader controlled validation; relevant readiness criteria and owner approval are recorded |
| Release candidate, when useful | Exact candidate is frozen except for release blockers and final checks |
| Stable 1.0.0 | Existing production/pilot/release criteria pass and the owner explicitly approves the stable release |

A typical progression is `1.0.0-alpha.1`, later Alpha checkpoints, `1.0.0-beta.1`, optional `1.0.0-rc.1`, then `1.0.0`. Promotion is an evidence decision, not automatic after a phase number.

For stable versions, use major changes for incompatible supported contracts, minor changes for compatible features, and patches for compatible fixes. Document the affected compatibility surface. During prerelease work, report breaking changes explicitly rather than imply stable guarantees.

## Completion and release procedure

1. Review the actual diff and affected behavior. Update the relevant maintained docs.
2. Add notable changes under Unreleased using Added, Changed, Fixed, Deprecated, Removed or Security as applicable.
3. At an accepted major checkpoint, choose the next version; update package/lock metadata and current documentation labels together.
4. Create a [change/checkpoint record](../templates/change-record.md) with scope, date, version, issue/phase, exact artifact identity, environment, verification and unresolved limits.
5. Check local links, version agreement, examples, privacy and accuracy. Run change-appropriate software checks. Record actual results.
6. Follow existing human acceptance and tracker rules. Documentation does not substitute for missing tests, approvals or participant evidence.
7. Create a Git tag or published release only when explicitly authorized. Deployment and Production writes remain separately authorized.

The contributor making the change owns its documentation. A reviewer checks factual accuracy, commands/links, affected compatibility and evidence scope. If a required document or check is missing, report the work incomplete.
