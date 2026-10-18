import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { makeExam002Candidate } from '../lib/fixtures/phaseTenExam002Candidate'
import BlueprintPaperReview from './BlueprintPaperReview'

it('renders the student production projection without answer-only content or false page boundaries', () => {
  const snapshot = makeExam002Candidate('tissue')
  const question = snapshot.branches[0].items[0].question
  if (question.type !== 'short-answer') throw new Error('The fixture lost its short answer.')
  question.answer.canonicalAnswer = 'ANSWER_ONLY_SENTINEL'
  snapshot.branches[0].passageGroup!.children[0].question = structuredClone(question)
  const html = renderToStaticMarkup(<BlueprintPaperReview snapshot={snapshot}
    settings={{ schoolName: 'Synthetic school', examTitle: 'Synthetic paper', teacherName: 'Synthetic teacher',
      grade: 6, unit: 1, marksPerQuestion: 1, questionCount: 30, selectionSeed: snapshot.selectionSeed }}
    generalInstruction="Follow the instructions." />)
  expect(html).toContain('Student paper content')
  expect(html).toContain('Synthetic school')
  expect(html).toContain('Teacher: Synthetic teacher')
  expect(html).toContain('Page breaks and Word layout are not shown.')
  expect(html).toContain(snapshot.branches[0].passageGroup!.passage.replaceAll('&', '&amp;').replaceAll('’', '’'))
  expect(html).not.toContain('ANSWER_ONLY_SENTINEL')
  expect(html).not.toContain('Answers and marking rules')
})

it('withholds the paper when header settings are invalid', () => {
  const snapshot = makeExam002Candidate('tissue')
  const html = renderToStaticMarkup(<BlueprintPaperReview snapshot={snapshot}
    settings={{ schoolName: '', examTitle: 'Synthetic paper', teacherName: '', grade: 6, unit: 1,
      marksPerQuestion: 1, questionCount: 30, selectionSeed: snapshot.selectionSeed }} generalInstruction="Answer." />)
  expect(html).toContain('School name is required.')
  expect(html).not.toContain('Student paper content')
})
