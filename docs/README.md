# ExamGO documentation

Product: ExamGO by MineGO Studio

Applies to: `1.0.0-alpha.1` — Alpha 1

Last reviewed: 21 October 2026

This is the official documentation entry point. It separates how to use the product, how it works, and the evidence supporting a particular checkpoint.

## Learn and use

- [Teacher guide](guides/teacher-guide.md): prepare, review, save and download a supported paper.
- [Development setup](guides/development.md): configure a local checkout and run the project checks.
- [Alpha limitations](reference/alpha-limitations.md): availability, output and acceptance boundaries.
- [Current Alpha content and builder coverage](reference/alpha-content-and-builder-coverage-2026-10-21.md): dated Unit 1–4 inventory, actual generation limits and feasible-brief gaps.

## Understand and maintain

- [System overview](reference/system-overview.md): questions, groups, banks, marks, drafts and finalized documents.
- [Paper format rules](reference/paper-format-rules.md): shared header placement and student mark-label rules for every new export.
- [Import contract](imports/phase11-interchange-contract.md): supported formats, field rules, limits and retry behavior.
- [Question-domain and snapshot decision](architecture/adr-0001-question-domain-and-snapshots.md): historical architecture rationale; read current code for implementation.
- [Documentation and versioning policy](maintenance/documentation-and-versioning.md): what must change with a feature, phase or release.
- [Roadmap project routing checkpoint](maintenance/roadmap-project-routing-2026-10-21.md): UI/UX ownership in ExamGO Designing and the main-product technical/Alpha handoff.
- [Change-record template](templates/change-record.md): a reusable record for substantial changes.
- [Changelog](../CHANGELOG.md) and [Alpha 1 checkpoint](releases/1.0.0-alpha.1.md).

## Verification and operational references

- [Document fixture evidence](fixtures/README.md) explains package and visual-acceptance boundaries.
- [Security baseline](security/phase-15-security-baseline.md), [threat model](security/phase-15a-threat-model.md) and [recovery/regression evidence](security/phase-15b-recovery-and-regression-2026-10-18.md) are dated engineering records. They are not universal guarantees or permission to perform their historical actions.
- [Private Alpha preparation](phase-16/README.md) contains the observation protocol and blank materials. Actual participant records stay in authorized private storage.
- [Teacher trial by private text](phase-16/teacher-text-pack.md) provides short messages and separates reported outcomes from inspected documents and observed-workflow gates.
- [Non-UI Alpha readiness checkpoint](phase-16/non-ui-readiness-2026-10-21.md) records the content, output and reliability checks, exact source/build identity and remaining session requirements.
- [Shared paper-format checkpoint](phase-16/paper-format-rules-2026-10-21.md) records the owner Word review, general output rules and revised candidate verification.
- [Research behind this documentation structure](research/documentation-approach-2026-10-20.md).
- [Researched Alpha workflow subtasks](research/alpha-workflow-roadmap-proposal-2026-10-20.md): original research and dated issue mapping; read the 21 October routing checkpoint for current project placement.

Operational instructions must identify the exact environment, access, validation, recovery and approval boundary before use. A historical rehearsal or source file does not establish that an action is safe today.

## Authority and freshness

Linear owns live phase/issue status and dependencies. ExamGO tracks the product lifecycle and technical integration; ExamGO Designing tracks the UI/UX sequence and visual acceptance. Notion is historical evidence only. A version label does not close a phase, prove content coverage or authorize a deployment.

Older records retain their original dates, terminology and evidence scope. This index provides navigation without rewriting them. Current guides describe inspected source behavior; hosted builds can differ. Record the exact build when reporting a problem.

Repository documentation may include internal technical references. Review content before publishing it externally; never include credentials, private endpoints, participant records or raw private data.
