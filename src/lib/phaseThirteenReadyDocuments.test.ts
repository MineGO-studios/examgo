import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { it, vi } from 'vitest'
import { DEFAULT_EXAM_SETTINGS } from '../types/exam'
import { createCompoundDocumentBlobs, projectCompoundPaper } from './compoundWorkflow'
import { parsePresetExercise, presetExerciseRenderSnapshot } from './presetExerciseProjection'
import { inspectDocx } from './testSupport/docxPackage'

const capturePath = process.env.PHASE13_READY_CAPTURE

it.skipIf(!capturePath)('checks every current ready exercise in paired DOCX packages', async () => {
  const api = JSON.parse(readFileSync(capturePath!, 'utf8')) as {
    publisherPrivateQuestionRows: number
    projection: { nextCursor: string | null; exercises: unknown[] }
  }
  assert.equal(api.publisherPrivateQuestionRows, 0)
  assert.equal(api.projection.nextCursor, null, 'Incomplete ready exercise capture')
  const owner = '00000000-0000-4000-8000-000000000001'
  const publicExercises = api.projection.exercises
  const exercises = publicExercises.map(raw => parsePresetExercise(raw, owner))
  assert.ok(exercises.length > 0)
  const templates = ['exam', 'answer-key'].map(kind =>
    Uint8Array.from(readFileSync(`public/templates/iraqi-mainstream-phase-nine-${kind}-v1.docx`)).buffer)
  vi.stubGlobal('DOMParser', DOMParser)
  vi.stubGlobal('XMLSerializer', XMLSerializer)
  vi.stubGlobal('fetch', async () => { throw new Error('Network denied in document verification.') })
  try {
    for (const [index, exercise] of exercises.entries()) {
      const units = [...new Set(exercise.members.map(member => member.question.unit))]
      const snapshot = presetExerciseRenderSnapshot(publicExercises[index], owner, 8162026, exercise.attemptCount * 2)
      const settings = { ...DEFAULT_EXAM_SETTINGS, unit: units[0], schoolName: 'Development verification',
        examTitle: 'Source exercise', questionCount: snapshot.branches[0].items.length,
        marksPerQuestion: 2, selectionSeed: 8162026 }
      const pair = await createCompoundDocumentBlobs(snapshot, settings, 'Answer as instructed.',
        templates[0], templates[1], units)
      const student = await inspectDocx(pair.exam)
      const key = await inspectDocx(pair.answerKey)
      const projected = projectCompoundPaper(snapshot, settings, 'Answer as instructed.', units)
      const answerTable = key.tables.find(rows => rows[0]?.map(cell => cell.text).join('|') ===
        'Q|Part|Rule|Point|Answer|Mark|Total')
      assert.ok(answerTable, `Answer table missing in ${exercise.id}`)
      assert.equal(answerTable.length, projected.answerKey.Answers.length + 1,
        `Answer row count differs in ${exercise.id}`)
      const documentText = (text: string) => text.replace(/\s+/g, ' ').trim()
      for (const member of exercise.members) {
        assert.ok(documentText(student.text).includes(documentText(member.question.prompt)),
          `Student paper omits a source question in ${exercise.id}`)
        for (const document of [student, key]) {
          assert.ok(!document.text.includes(member.revisionId), `Private revision in ${exercise.id}`)
          assert.ok(!document.text.includes('idea:'), `Private selection key in ${exercise.id}`)
        }
      }
      for (const [answerIndex, answer] of projected.answerKey.Answers.entries()) {
        const row: { text: string }[] = answerTable[answerIndex + 1]
        assert.equal(row[3].text, answer.Point, `Answer point differs in ${exercise.id}`)
        assert.equal(row[4].text.replace(/\s/g, ''), String(answer.Answer).replace(/\s/g, ''),
          `Answer text differs in ${exercise.id}`)
        assert.equal(row[5].text, String(answer.Mark), `Answer mark differs in ${exercise.id}`)
      }
    }
    console.log(`PASS ${exercises.length * 2} structural DOCX packages from ${exercises.length} complete ready exercises.`)
  } finally {
    vi.unstubAllGlobals()
  }
}, 300_000)
