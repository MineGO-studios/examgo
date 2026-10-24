import { describe, expect, it } from 'vitest'
import { canTransitionCuration, describeSourceTrust, parsePresetProvenance, provenanceApprovalProblems,
  type PresetProvenance } from './presetCuration'

export const PROVENANCE: PresetProvenance = { schemaVersion: 2, sourceReference: 'Neutral source 1',
  corpusScope: '', ministerialOccurrences: null, missingEvidence: [] }
const legacy = { ...PROVENANCE, schemaVersion: 1, curriculumVersion: '', author: '', sourceKind: 'unknown',
  sourceEvidence: 'unverified', answerEvidence: '', rightsStatus: 'unknown', rightsEvidence: '' }

describe('preset provenance', () => {
  it('requires remaining fields without the seven removed preset fields', () => {
    expect(parsePresetProvenance(PROVENANCE)).toEqual(PROVENANCE)
    expect(provenanceApprovalProblems(PROVENANCE)).toEqual([])
    expect(describeSourceTrust(PROVENANCE)).toBe('Traceable preset source')
    expect(provenanceApprovalProblems({ ...PROVENANCE, sourceReference: '' })).toEqual(['Traceable source is missing.'])
  })
  it('rejects injected approval, retired fields in new work and unknown schemas', () => {
    expect(() => parsePresetProvenance({ ...PROVENANCE, approved: true })).toThrow()
    expect(() => parsePresetProvenance({ ...PROVENANCE, author: 'Old field' })).toThrow()
    expect(() => parsePresetProvenance({ ...PROVENANCE, schemaVersion: 3 })).toThrow()
  })
  it('reads old history without rewriting stored metadata or retaining retired default blockers', () => {
    const stored = { ...legacy, missingEvidence: ['Verify curriculum edition and named source author.',
      'Verify source classification, answer evidence and reuse permission.', 'Answer needs correction.'] }
    const before = JSON.stringify(stored)
    expect(parsePresetProvenance(stored)).toEqual({ ...PROVENANCE, missingEvidence: ['Answer needs correction.'] })
    expect(JSON.stringify(stored)).toBe(before)
    expect(() => parsePresetProvenance({ ...stored, privateSourceNotes: 'Secret' })).toThrow()
  })
  it('requires scope for descriptive ministerial counts', () => {
    expect(() => parsePresetProvenance({ ...PROVENANCE, ministerialOccurrences: 3 })).toThrow('corpus')
    expect(() => parsePresetProvenance({ ...PROVENANCE, ministerialOccurrences: 3, corpusScope: 'Assessed papers' })).not.toThrow()
    expect(() => parsePresetProvenance({ ...PROVENANCE, ministerialOccurrences: -1 })).toThrow()
  })
  it('bounds remaining fields and keeps actual content problems', () => {
    expect(() => parsePresetProvenance({ ...PROVENANCE, sourceReference: 'x'.repeat(501) })).toThrow()
    expect(() => parsePresetProvenance({ ...PROVENANCE, missingEvidence: [null] })).toThrow()
    expect(provenanceApprovalProblems({ ...PROVENANCE, missingEvidence: ['Missing passage.'] })).toEqual(['Missing passage.'])
  })
  it('does not revive withdrawn or superseded approvals', () => {
    expect(canTransitionCuration('draft', 'approved')).toBe(false)
    expect(canTransitionCuration('in-review', 'approved')).toBe(true)
    expect(canTransitionCuration('approved', 'draft')).toBe(false)
    expect(canTransitionCuration('withdrawn', 'approved')).toBe(false)
    expect(canTransitionCuration('superseded', 'approved')).toBe(false)
  })
})
