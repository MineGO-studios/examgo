import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
import { packStagingBatches, summarizeStagedRow } from './questionImportRepository'

function row(id: string, groupIds: string[], size = 0) {
  return {
    catalogueId: id, sourceContentHash: 'a'.repeat(64), sourceFields: { catalogue_id: id, note: 'x'.repeat(size) },
    unitTags: [1], displayUnit: 1, groupIds,
    normalized: { sourceOrder: 1, catalogueId: id, type: 'binary' as const, prompt: 'True?',
      unitTags: [1], displayUnit: 1, lesson: '1', difficulty: 'medium' as const,
      difficultyProvisional: true, selectionMarks: null, content: null,
      answer: 'True', groupIds, groupCompleteness: null,
      sourceFields: { catalogue_id: id }, issues: [] },
  }
}

describe('group-preserving intake batches', () => {
  it('keeps transitive group components together across the row cap', () => {
    const rows = Array.from({ length: 101 }, (_, index) => row(`Q-${index}`, []))
    rows[0].groupIds = ['A']
    rows[100].groupIds = ['A', 'B']
    rows[50].groupIds = ['B']
    const batches = packStagingBatches(rows)
    expect(batches.flat()).toHaveLength(101)
    expect(batches.every((batch) => batch.length <= 100)).toBe(true)
    const groupBatch = batches.find((batch) => batch.some((item) => item.catalogueId === 'Q-0'))
    expect(groupBatch?.map((item) => item.catalogueId)).toEqual(expect.arrayContaining(['Q-0', 'Q-50', 'Q-100']))
  })

  it('rejects one group above the atomic payload limit', () => {
    expect(() => packStagingBatches([row('Q-1', ['A'], 700_001)])).toThrow(/atomic import batch/)
  })
})

describe('saved intake review', () => {
  it('shows source content without treating missing exam marks as a content defect', () => {
    expect(summarizeStagedRow({
      catalogue_id: 'Q-1', source_fields: { question_type: 'binary', question_text: 'True?',
        answer_text: 'True', lesson: '2', group_completeness: 'partial' },
      normalized: { issues: ['selection-marks-unassigned', 'group-incomplete'] },
      unit_tags: [1, 2], display_unit: 2, selection_marks: null, group_ids: ['G-1'],
    })).toMatchObject({
      catalogueId: 'Q-1', prompt: 'True?', answer: 'True', displayUnit: 2,
      issues: ['group-incomplete'],
    })
  })

  it('flags an empty matching prompt in an already saved source row', () => {
    expect(summarizeStagedRow({
      catalogue_id: 'Q-1933', source_fields: { question_type: 'matching', question_text: '' },
      normalized: { prompt: '', issues: [] }, unit_tags: [2], display_unit: 2,
      selection_marks: null, group_ids: ['GRP-0620'],
    }).issues).toContain('prompt-missing')
  })
})
