import { preparePaperTemplate } from './paperTemplateFormat'
import { compoundBranchPointIds, parseCompoundSnapshot, type CompoundBranch, type CompoundSnapshot } from '../domain/compoundStructure'
import type { DomainQuestion } from '../domain/questionDomain'
import { hasPrintedChoiceOptions } from './printedChoiceOptions'
import type { ExamSettings } from '../types/exam'
import { getFirstValidationError, validateExamSettings } from './validateExamSettings'
import { projectMatching } from './matchingProjection'
import { validateDocumentText } from './documentText'
import { mergeStructuredAnswerCells, type AnswerMergeGroup, type PhaseNineAnswerRow, type PhaseNineStudentBranch } from './phaseNineWorkflow'

function answerFor(question: DomainQuestion): string {
  switch (question.type) {
    case 'multiple-choice': {
      const option = question.content.options.find((candidate) => candidate.label.trim().toUpperCase() === question.answer.correctOptionLabel.trim().toUpperCase())
      return option?.text ?? ''
    }
    case 'binary': return question.answer.isTrue ? (question.content.labelMode === 'yes-no' ? 'Yes' : 'True') : (question.content.labelMode === 'yes-no' ? 'No' : 'False')
    case 'short-answer': return [question.answer.canonicalAnswer, ...(question.answer.approvedVariants ?? [])].join(' / ')
    case 'completion': return question.content.blankIds.map((id) => question.answer.answers[id]).join(' / ')
    case 'odd-word': return question.answer.oddWord
    case 'word-relationship':
    case 'rewrite': return question.answer.acceptedAnswers.join(' / ')
    case 'extended-writing': return question.answer.modelAnswer || question.answer.manualMarkingNote || 'Manual marking'
    case 'matching': return ''
  }
}

function printedQuestion(question: DomainQuestion): string {
  if (question.type === 'multiple-choice' && !hasPrintedChoiceOptions(question.prompt, question.content.options)) return `${question.prompt} (${question.content.options.map((option) => option.text).join(' / ')})`
  if (question.type === 'binary') return `${question.prompt} ${question.content.labelMode === 'yes-no' ? 'Yes/No' : 'T/F'}`
  if (question.type === 'odd-word') return question.content.words.join(' / ')
  return question.prompt
}

function studentBranch(branch: CompoundBranch, seed: number): PhaseNineStudentBranch {
  let body = ''
  let alternativeA = ''; let alternativeB = ''
  if (branch.kind === 'matching') {
    const question = branch.items[0].question
    if (question.type === 'matching') {
      const projection = projectMatching(question, seed)
      body = `List (A)\n${projection.left.map((item, index) => `${index + 1}. ${item.text}`).join('\n')}\nList (B)\n${projection.right.map((item, index) => `${String.fromCharCode(97 + index)}. ${item.text}`).join('\n')}`
    }
  } else if (branch.kind === 'completion') {
    const lines = branch.items.flatMap(({ question }) => question.type === 'completion' ? question.content.text.split(/\r?\n/) : [])
    body = lines.map((line, index) => `${index + 1}. ${line}`).join('\n')
  } else if (branch.kind === 'alternatives') {
    alternativeA = `A- ${printedQuestion(branch.items[0].question)}`
    alternativeB = `B- ${printedQuestion(branch.items[1].question)}`
  } else {
    const questions = branch.items.map((item) => (item.label === 'Main'
      ? printedQuestion(item.question) : `${item.label}. ${printedQuestion(item.question)}`)).join('\n')
    body = branch.kind === 'passage' ? `${branch.passageGroup?.passage ?? ''}\n${questions}` : questions
  }
  return {
    Heading: `Q${branch.mainQuestionNumber}${branch.branchLabel ? `-${branch.branchLabel}` : ''}/ ${branch.instruction}`,
    ArabicInstruction: branch.arabicInstruction ?? '', Marks: branch.marks,
    WordBank: branch.kind === 'completion' && branch.items[0].question.type === 'completion'
      ? `{${branch.items[0].question.content.wordBank.join(',  ')}}` : '',
    Body: body, AlternativeA: alternativeA, AlternativeAArabic: '',
    AlternativeB: alternativeB, AlternativeBArabic: '', AnswerSpace: '',
  }
}

function answerRows(branch: CompoundBranch, seed: number): PhaseNineAnswerRow[] {
  const pointIds = compoundBranchPointIds(branch)
  const pointMark = (index: number) => branch.pointMarks?.[pointIds[index]] ?? branch.marks / branch.attemptCount
  const displayed = branch.kind === 'matching' && branch.items[0].question.type === 'matching'
    ? branch.items[0].question.content.left.length
    : branch.kind === 'completion' && branch.items[0].question.type === 'completion'
      ? pointIds.length : branch.items.length
  const rule = branch.kind === 'alternatives' ? 'Choose A or B'
    : branch.attemptCount < displayed ? `Answer ${branch.attemptCount} of ${displayed}`
      : displayed === 1 ? 'Answer 1' : `Answer all ${displayed}`
  const base = { Q: String(branch.mainQuestionNumber), Part: branch.branchLabel ?? '—', Rule: rule,
    Mark: branch.marks / branch.attemptCount, Total: branch.marks }
  if (branch.kind === 'matching') {
    const question = branch.items[0].question
    if (question.type !== 'matching') return []
    return projectMatching(question, seed).answerKey.map((pair, index) => ({ ...base,
      Point: String(index + 1), Answer: pair.displayLetter, Mark: pointMark(index) }))
  }
  if (branch.kind === 'completion') {
    const answers = branch.items.flatMap(({ question }) => question.type === 'completion'
      ? question.content.blankIds.map((id) => question.answer.answers[id]) : [])
    return answers.map((answer, index) => ({ ...base, Point: String(index + 1), Answer: answer, Mark: pointMark(index) }))
  }
  return branch.items.map((item, index) => ({ ...base, Point: item.label === 'Main' ? '—' : item.label, Answer: answerFor(item.question), Mark: pointMark(index) }))
}

export function projectCompoundPaper(snapshot: CompoundSnapshot, settings: ExamSettings, generalInstruction: string,
  coverageUnits?: readonly number[]) {
  const validated = parseCompoundSnapshot(snapshot)
  const questions = validated.branches.flatMap((branch) => branch.items.map((item) => item.question))
  const settingsErrors = validateExamSettings(settings, questions.length)
  if (coverageUnits !== undefined) {
    const maximumCoverageUnit = validated.branches.every((branch) => branch.answerRule !== undefined) ? 8 : 4
    if (!coverageUnits.length || new Set(coverageUnits).size !== coverageUnits.length ||
      coverageUnits.some(unit => !Number.isInteger(unit) || unit < 1 || unit > maximumCoverageUnit) || !coverageUnits.includes(settings.unit)) {
      throw new Error(`Explicit compound coverage must contain the paper unit within Units 1-${maximumCoverageUnit}.`)
    }
    delete settingsErrors.unit
  }
  const settingsError = getFirstValidationError(settingsErrors)
  if (settingsError) throw new Error(settingsError)
  if (settings.selectionSeed !== validated.selectionSeed || settings.questionCount !== questions.length ||
    questions.some((question) => coverageUnits ? !coverageUnits.includes(question.unit) : question.unit !== settings.unit) ||
    coverageUnits?.some((unit) => !questions.some((question) => question.unit === unit))) {
    throw new Error('Paper settings disagree with the captured compound questions, coverage and seed.')
  }
  if (!generalInstruction.trim()) throw new Error('A general paper instruction is required.')
  const teacherName = settings.teacherName?.trim() || '____________________'
  const branchRows = validated.branches.map((branch) => answerRows(branch, validated.selectionSeed))
  return {
    exam: { ExamTitle: settings.examTitle.trim(), SchoolName: settings.schoolName.trim(), Grade: String(settings.grade),
      TeacherName: teacherName, GeneralInstruction: generalInstruction.trim(),
      Branches: validated.branches.map((branch) => studentBranch(branch, validated.selectionSeed)) },
    answerKey: { ExamTitle: settings.examTitle.trim(), SchoolName: settings.schoolName.trim(), Grade: String(settings.grade),
      TeacherName: teacherName, Answers: branchRows.flat() },
    mergeGroups: branchRows.reduce<AnswerMergeGroup[]>((groups, rows) => {
      groups.push({ start: groups.reduce((sum, group) => sum + group.length, 0), length: rows.length, mergeAnswer: false,
        ...(validated.schemaVersion === 2 ? { mergeMarks: false } : {}) })
      return groups
    }, []),
  }
}

async function compactCompoundStudent<T extends Blob | ArrayBuffer>(exam: T, snapshot: CompoundSnapshot): Promise<T> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(exam)
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('The student DOCX is missing word/document.xml.')
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const document = new DOMParser().parseFromString(await file.async('string'), 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('The student DOCX XML is invalid.')
  const body = document.getElementsByTagNameNS(namespace, 'body')[0]
  if (!body) throw new Error('The student DOCX has no document body.')
  const w = (name: string) => document.createElementNS(namespace, `w:${name}`)
  const attr = (element: Element, name: string, value: string) => element.setAttributeNS(namespace, `w:${name}`, value)
  const matching = snapshot.branches.filter((branch) => branch.kind === 'matching')
  let matchingIndex = 0
  const cell = (value: string, widthTwips: string) => {
    const tc = w('tc'); const tcPr = w('tcPr'); const width = w('tcW')
    attr(width, 'w', widthTwips); attr(width, 'type', 'dxa'); tcPr.appendChild(width); tc.appendChild(tcPr)
    const p = w('p'); const pPr = w('pPr'); const spacing = w('spacing')
    attr(spacing, 'before', '0'); attr(spacing, 'after', '0'); pPr.appendChild(spacing); p.appendChild(pPr)
    const run = w('r'); const runPr = w('rPr'); const size = w('sz')
    attr(size, 'val', '20'); runPr.appendChild(size); run.appendChild(runPr)
    const text = w('t'); text.textContent = value; run.appendChild(text); p.appendChild(run); tc.appendChild(p)
    return tc
  }
  const tableFor = (branch: CompoundBranch) => {
    const question = branch.items[0].question
    if (question.type !== 'matching') throw new Error('A matching branch lost its canonical question.')
    const projection = projectMatching(question, snapshot.selectionSeed)
    const narrow = branch.mainQuestionNumber === 3 && branch.branchLabel === 'A'
    const columnWidth = narrow ? '2700' : '5400'
    const table = w('tbl'); const properties = w('tblPr'); const width = w('tblW'); const layout = w('tblLayout')
    attr(width, 'w', narrow ? '5400' : '10800'); attr(width, 'type', 'dxa'); attr(layout, 'type', 'fixed')
    properties.appendChild(width)
    if (narrow) {
      const alignment = w('jc'); attr(alignment, 'val', 'center'); properties.appendChild(alignment)
      const borders = w('tblBorders')
      for (const side of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
        const edge = w(side)
        attr(edge, 'val', 'single'); attr(edge, 'sz', '4'); attr(edge, 'color', '000000')
        borders.appendChild(edge)
      }
      properties.appendChild(borders)
    }
    properties.appendChild(layout); table.appendChild(properties)
    const grid = w('tblGrid')
    for (let i = 0; i < 2; i++) { const col = w('gridCol'); attr(col, 'w', columnWidth); grid.appendChild(col) }
    table.appendChild(grid)
    const rows = [['List (A)', 'List (B)'], ...projection.left.map((left, index) => [
      `${index + 1}. ${left.text}`, `${String.fromCharCode(97 + index)}. ${projection.right[index].text}`,
    ])]
    for (const row of rows) { const tr = w('tr'); row.forEach((value) => tr.appendChild(cell(value, columnWidth))); table.appendChild(tr) }
    return table
  }
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType !== 1 || (node as Element).localName !== 'p') continue
    const paragraph = node as Element
    if (!paragraph.textContent?.trim() && !paragraph.getElementsByTagNameNS(namespace, 'drawing').length) {
      body.removeChild(paragraph)
      continue
    }
    if (paragraph.textContent?.startsWith('List (A)')) {
      const branch = matching[matchingIndex++]
      if (!branch) throw new Error('The student DOCX has an unexpected matching body.')
      body.replaceChild(tableFor(branch), paragraph)
      continue
    }
    let pPr = Array.from(paragraph.childNodes).find((child) => child.nodeType === 1 && (child as Element).localName === 'pPr') as Element | undefined
    if (!pPr) { pPr = w('pPr'); paragraph.insertBefore(pPr, paragraph.firstChild) }
    let spacing = Array.from(pPr.childNodes).find((child) => child.nodeType === 1 && (child as Element).localName === 'spacing') as Element | undefined
    if (!spacing) { spacing = w('spacing'); pPr.appendChild(spacing) }
    attr(spacing, 'before', '0'); attr(spacing, 'after', '0'); attr(spacing, 'line', '240'); attr(spacing, 'lineRule', 'auto')
  }
  if (matchingIndex !== matching.length) throw new Error('A matching body is missing from the student DOCX.')
  let questionHeadings = 0
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType !== 1 || (node as Element).localName !== 'tbl' ||
      !/^Q\d+(?:-|\/)/.test(node.textContent?.trim() ?? '')) continue
    if (questionHeadings++) {
      const gap = w('p'); const properties = w('pPr'); const spacing = w('spacing')
      attr(spacing, 'before', '0'); attr(spacing, 'after', '0')
      attr(spacing, 'line', '120'); attr(spacing, 'lineRule', 'exact')
      properties.appendChild(spacing); gap.appendChild(properties)
      body.insertBefore(gap, node)
    }
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(document))
  return await zip.generateAsync({ type: exam instanceof Blob ? 'blob' : 'arraybuffer', compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) as T
}

export async function createCompoundDocumentBlobs<T extends Blob | ArrayBuffer>(
  snapshot: CompoundSnapshot, settings: ExamSettings, generalInstruction: string,
  examTemplate: T, answerKeyTemplate: T, coverageUnits?: readonly number[],
): Promise<{ exam: T; answerKey: T }> {
  const captured = parseCompoundSnapshot(JSON.parse(JSON.stringify(snapshot)))
  const projection = projectCompoundPaper(captured, settings, generalInstruction, coverageUnits)
  validateDocumentText(projection.exam)
  validateDocumentText(projection.answerKey)
  const { TemplateHandler } = await import('easy-template-x')
  const [exam, rawAnswerKey] = await Promise.all([
    new TemplateHandler().process(await preparePaperTemplate(examTemplate, 'student'), projection.exam),
    new TemplateHandler().process(await preparePaperTemplate(answerKeyTemplate, 'key'), projection.answerKey),
  ])
  return { exam: await compactCompoundStudent(exam, captured),
    answerKey: await mergeStructuredAnswerCells(rawAnswerKey, projection.mergeGroups) }
}
