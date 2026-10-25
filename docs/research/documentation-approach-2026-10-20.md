# Documentation and versioning approach

Reviewed: 20 October 2026

## Research findings

[Diátaxis](https://diataxis.fr/) organizes documentation around tutorials, how-to guides, reference and explanation. For ExamGO this supports a small reader-focused index, teacher/development instructions, exact contracts and architecture rationale. Historical evidence remains linked separately.

[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) defines numeric versions, prerelease identifiers such as alpha/beta and immutable released versions. ExamGO uses this syntax for product checkpoints while retaining independent import, snapshot, schema and renderer versions. It does not treat a prerelease label as acceptance evidence.

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) recommends a human-readable history of notable changes, dated versions, an Unreleased section and recognizable change categories. ExamGO records user-relevant changes rather than copying commit logs.

These sources inform the project policy. They do not define ExamGO's Alpha/Beta criteria or authorize publishing; those are local product decisions constrained by the existing roadmap.

## Adopted structure

The [documentation index](../README.md) links maintained guides, reference, policy and release records. The [policy](../maintenance/documentation-and-versioning.md) assigns documentation ownership to the contributor making a change and requires scope, evidence and version labels at substantial checkpoints.

The current package placeholder is replaced with `1.0.0-alpha.1`. This is the first explicit product checkpoint, not a rewrite of historical release evidence. Stable `1.0.0` remains subject to existing release gates.

Use plain product language and preserve technical/source accuracy. Existing licenses, source provenance and human acceptance evidence remain intact. No historical record is rewritten to disguise its origin or claim new testing.

## Deliberate limits

No documentation-site framework, hosted portal, new dependency, automatic tagger or publication workflow is introduced. Repository Markdown is sufficient for the current project. No test or deployment is marked complete by creating documentation.
