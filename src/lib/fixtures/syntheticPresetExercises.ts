/** Synthetic public wire fixtures: no captured accounts, source corpus or tracker data. */
const id = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`

// JSON wire values deliberately retain the parser's unknown-input test boundary.
export const syntheticMatchingEntries = JSON.parse(JSON.stringify([0, 1].map(n => {
  const questionId = id(100 + n), revisionId = id(200 + n)
  return {
    sourceGroup: { id: id(300 + n) }, questionId, revisionId, revision: 1, unit: 1, lesson: '1',
    prompt: `Match synthetic set ${n + 1}.`,
    content: { type: 'matching', schemaVersion: 1,
      left: Array.from({ length: 6 }, (_, p) => ({ id: `left:${p + 1}`, text: `Synthetic left ${n}-${p}` })),
      right: Array.from({ length: 6 }, (_, p) => ({ id: `right:${p + 1}`, text: `Synthetic right ${n}-${p}` })),
    },
    answer: { type: 'matching', schemaVersion: 1,
      pairs: Array.from({ length: 6 }, (_, p) => ({ leftId: `left:${p + 1}`, rightId: `right:${p + 1}` })),
    },
    pointMapping: { schemaVersion: 1, revisionId,
      points: Array.from({ length: 6 }, (_, p) => ({ pointId: `${questionId}:pair:left:${p + 1}`, ideaKeys: [`synthetic-match-${n}-${p}`] })),
    },
  }
})))

export const syntheticReviewedExercises = JSON.parse(JSON.stringify(Array.from({ length: 5 }, (_, n) => ({
  schemaVersion: 1, id: id(400 + n), revision: 1, kind: 'questions', title: null,
  instruction: 'Answer five synthetic questions.', arabicInstruction: null, passage: null,
  displayedPointCount: 6, attemptCount: 5,
  members: Array.from({ length: 6 }, (_, p) => ({
    revisionId: id(500 + p), curationId: id(600 + p), revision: 1, reviewVersion: 1,
    reviewer: 'Fixture reviewer', publisher: 'Fixture publisher',
    approvedAt: '2026-01-01T00:00:00Z', publishedAt: '2026-01-01T00:01:00Z',
    provenance: { schemaVersion: 2, sourceReference: 'Synthetic fixture', corpusScope: '', ministerialOccurrences: null, missingEvidence: [] },
    question: { id: id(700 + p), schemaVersion: 1, type: 'multiple-choice', unit: 1, lesson: '1', difficulty: 'medium',
      prompt: `Synthetic question ${p + 1}?`,
      content: { type: 'multiple-choice', schemaVersion: 1, options: [{ label: 'A', text: `Synthetic correct ${p}` }, { label: 'B', text: `Synthetic distractor ${p}` }] },
      answer: { type: 'multiple-choice', schemaVersion: 1, correctOptionLabel: 'A' },
    },
    selectionKeys: [`idea:synthetic-fact-${p}`, `wording:${String(p + 1).repeat(32)}`, `family:${String(p + 1).repeat(32)}`],
    pointIdeas: null,
  })),
}))))
