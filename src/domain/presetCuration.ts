export const CURATION_STATES = ['draft', 'in-review', 'approved', 'superseded', 'withdrawn'] as const
export type CurationState = typeof CURATION_STATES[number]

/** Current preset fields. Version 1 is read for history, never emitted for new work. */
export type PresetProvenance = {
  schemaVersion: 2
  sourceReference: string
  corpusScope: string
  ministerialOccurrences: number | null
  missingEvidence: string[]
}

const TEXT_LIMITS = { sourceReference: 500, corpusScope: 2000 } as const
const LEGACY_TEXT_LIMITS = { ...TEXT_LIMITS, curriculumVersion: 200, author: 200, answerEvidence: 2000, rightsEvidence: 2000 }
const KEYS = ['schemaVersion', ...Object.keys(TEXT_LIMITS), 'ministerialOccurrences', 'missingEvidence']
const LEGACY_KEYS = [...KEYS, 'curriculumVersion', 'author', 'answerEvidence', 'rightsEvidence', 'sourceKind', 'sourceEvidence', 'rightsStatus']
// These exact defaults describe abolished requirements, not individual content defects.
const RETIRED_DEFAULTS = new Set(['Verify curriculum edition and named source author.',
  'Verify source classification, answer evidence and reuse permission.'])

export function parsePresetProvenance(value: unknown): PresetProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provenance must be an object.')
  const row = value as Record<string, unknown>
  const legacy = row.schemaVersion === 1
  const keys = legacy ? LEGACY_KEYS : KEYS
  if (Object.keys(row).length !== keys.length || Object.keys(row).some((key) => !keys.includes(key)) ||
    (!legacy && row.schemaVersion !== 2)) throw new Error('Use provenance schema version 2 with only supported fields.')
  for (const [key, limit] of Object.entries(legacy ? LEGACY_TEXT_LIMITS : TEXT_LIMITS)) {
    if (typeof row[key] !== 'string' || (row[key] as string).length > limit) {
      throw new Error(`Invalid provenance field: ${key}.`)
    }
  }
  if (legacy && (!['ministerial-paper', 'teacher-authored', 'unknown'].includes(String(row.sourceKind)) ||
    !['verified', 'unverified', 'missing'].includes(String(row.sourceEvidence)) ||
    !['unknown', 'permitted', 'restricted'].includes(String(row.rightsStatus)))) {
    throw new Error('Invalid source or rights status.')
  }
  if (row.ministerialOccurrences !== null && (!Number.isSafeInteger(row.ministerialOccurrences) ||
    (row.ministerialOccurrences as number) < 0 || (row.ministerialOccurrences as number) > 100_000 ||
    !(row.corpusScope as string).trim())) throw new Error('Occurrence counts require an assessed corpus scope.')
  if (!Array.isArray(row.missingEvidence) || row.missingEvidence.length > 20 ||
    row.missingEvidence.some((item) => typeof item !== 'string' || !item.trim() || item.length > 500)) {
    throw new Error('List at most 20 missing evidence items, each up to 500 characters.')
  }
  return { schemaVersion: 2, sourceReference: row.sourceReference as string, corpusScope: row.corpusScope as string,
    ministerialOccurrences: row.ministerialOccurrences as number | null,
    missingEvidence: (row.missingEvidence as string[]).filter(item => !legacy || !RETIRED_DEFAULTS.has(item)) }
}

export function provenanceApprovalProblems(provenance: PresetProvenance): string[] {
  const problems: string[] = []
  if (!provenance.sourceReference.trim()) problems.push('Traceable source is missing.')
  problems.push(...provenance.missingEvidence)
  return problems
}

export function describeSourceTrust(provenance: PresetProvenance): string {
  return provenance.sourceReference.trim() ? 'Traceable preset source' : 'Source reference missing'
}

export function canTransitionCuration(from: CurationState, to: CurationState): boolean {
  return (from === 'draft' && to === 'in-review') ||
    (from === 'in-review' && (to === 'draft' || to === 'approved' || to === 'withdrawn')) ||
    (from === 'approved' && (to === 'superseded' || to === 'withdrawn')) ||
    (from === 'draft' && to === 'withdrawn')
}
