import { describe, expect, it } from 'vitest'
import { catalogueGroupSemanticIssues, projectCatalogueGroups } from './catalogueGroupProjection'
import type { StagedInterchangeQuestion } from './questionInterchange'
import type { QuestionInput } from './questions'

const group = {
  group_id: 'GRP-1', parent_group_id: '', group_type: 'passage',
  instructions: 'Read and answer.', passage_text: 'A short passage.',
  display_count: 2, attempt_count: 2, group_marks: 5,
}

function question(id: string, contexts: object[]): StagedInterchangeQuestion {
  return {
    catalogueId: id, type: 'binary', prompt: 'True?', unitTags: [1],
    displayUnit: 1, lesson: '1', difficulty: 'medium',
    difficultyProvisional: true, selectionMarks: null, content: null,
    answer: 'True', groupIds: contexts.map((item) => (item as { group_id: string }).group_id),
    groupCompleteness: 'complete',
    sourceFields: { group_context_json: JSON.stringify(contexts) }, issues: [],
  }
}

describe('catalogue group projection', () => {
  it('keeps repeated source metadata and ordered members without adopting source marks', () => {
    const result = projectCatalogueGroups([question('Q-1', [group]), question('Q-2', [group])])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ sourceGroupId: 'GRP-1', groupType: 'passage',
      questionIds: ['Q-1', 'Q-2'], attemptCount: 2, expectedMarks: null,
      content: { sourceGroupType: 'passage', source: { group_marks: 5 } } })
  })

  it('preserves nested source hierarchy and rejects contradictory metadata', () => {
    const child = { ...group, group_id: 'GRP-2', parent_group_id: 'GRP-1',
      group_type: 'branch', group_marks: '' }
    expect(projectCatalogueGroups([question('Q-1', [group, child])])).toMatchObject([
      { sourceGroupId: 'GRP-1', parentSourceGroupId: null },
      { sourceGroupId: 'GRP-2', parentSourceGroupId: 'GRP-1', groupType: 'branch' },
    ])
    expect(() => projectCatalogueGroups([
      question('Q-1', [group]), question('Q-2', [{ ...group, instructions: 'Different' }]),
    ])).toThrow(/conflicts/)
  })

  it('rejects a missing parent or inconsistent context IDs', () => {
    expect(() => projectCatalogueGroups([question('Q-1', [{ ...group,
      parent_group_id: 'GRP-X' }])])).toThrow(/parent group is missing/)
    expect(() => projectCatalogueGroups([{ ...question('Q-1', [group]),
      groupIds: ['GRP-X'] }])).toThrow(/disagree/)
  })

  it('uses source member positions when file rows are reordered', () => {
    const first = question('Q-1', [group])
    const second = question('Q-2', [group])
    first.sourceFields.item_order = '1'
    second.sourceFields.item_order = '2'
    expect(projectCatalogueGroups([second, first])[0].questionIds).toEqual(['Q-1', 'Q-2'])
    second.sourceFields.item_order = '1'
    expect(() => projectCatalogueGroups([first, second])).toThrow(/positions/)
    delete second.sourceFields.item_order
    expect(() => projectCatalogueGroups([first, second])).toThrow(/positions/)
    expect(() => projectCatalogueGroups([first, first])).toThrow(/duplicate catalogue/)
  })

  it('allows positions to restart in separate branches of a parent', () => {
    const parent = { ...group, group_type: 'alternatives' }
    const a = { ...group, group_id: 'A', parent_group_id: 'GRP-1', group_type: 'branch' }
    const b = { ...a, group_id: 'B' }
    const first = question('Q-1', [parent, a])
    const second = question('Q-2', [parent, b])
    first.sourceFields.item_order = second.sourceFields.item_order = '1'
    expect(projectCatalogueGroups([first, second])[0].questionIds).toEqual(['Q-1', 'Q-2'])
  })

  it('flags printed counts that exceed converted points despite complete source labels', () => {
    const source = { ...group, group_type: 'printed_section', display_count: 6,
      attempt_count: 5, group_completeness: 'complete' }
    const projected = projectCatalogueGroups([question('Q-1', [source]), question('Q-2', [source])])
    const inputs = new Map<string, QuestionInput>([
      ['Q-1', { questionType: 'binary' } as QuestionInput],
      ['Q-2', { questionType: 'short-answer' } as QuestionInput],
    ])
    expect(catalogueGroupSemanticIssues(projected[0], inputs)).toEqual([
      'Printed display count 6 differs from 2 answerable points.',
      'Printed attempt count exceeds answerable points.',
    ])
  })

  it('counts matching pairs and requires passage attempt rules', () => {
    const source = { ...group, display_count: 3, attempt_count: '' as string | number,
      group_completeness: 'complete' }
    const projected = projectCatalogueGroups([question('Q-1', [source])])
    const inputs = new Map<string, QuestionInput>([['Q-1', {
      questionType: 'matching', matchingLeft: [
        { id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' },
      ],
    } as QuestionInput]])
    expect(catalogueGroupSemanticIssues(projected[0], inputs)).toEqual([
      'Passage attempt count is missing.',
    ])
    expect(catalogueGroupSemanticIssues({ ...projected[0], attemptCount: 3 }, inputs)).toEqual([])
  })
})
