import {
  getFirstQuestionValidationError,
  validateQuestionInput,
  type QuestionInput,
} from './questions'

const MAX_IMPORT_ROWS = 500
const OPTION_HEADERS = [
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'option_e',
  'option_f',
] as const

const REQUIRED_HEADERS = [
  'external_id',
  'unit',
  'lesson',
  'difficulty',
  'prompt',
  'option_a',
  'option_b',
  'correct_option_label',
] as const

export class QuestionCsvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuestionCsvError'
  }
}

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]

    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += character
      }

      continue
    }

    if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      record.push(field)
      field = ''
    } else if (character === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }

  if (quoted) {
    throw new QuestionCsvError(
      'The CSV contains an unterminated quoted field.',
    )
  }

  record.push(field)
  records.push(record)

  return records.filter((fields) =>
    fields.some((value) => value.trim().length > 0),
  )
}

function parseUnit(value: string, rowNumber: number): number {
  const normalized = value.trim()

  if (!/^\d+$/.test(normalized)) {
    throw new QuestionCsvError(
      `Row ${rowNumber}: unit must be a whole number.`,
    )
  }

  return Number(normalized)
}

function parseActive(value: string, rowNumber: number): boolean {
  const normalized = value.trim().toLowerCase()

  if (!normalized || ['true', '1', 'yes'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false
  }

  throw new QuestionCsvError(
    `Row ${rowNumber}: is_active must be true or false.`,
  )
}

export function parseQuestionCsv(
  csv: string,
  bankId: string,
): QuestionInput[] {
  const records = parseCsvRecords(csv.replace(/^\uFEFF/, ''))

  if (records.length < 2) {
    throw new QuestionCsvError(
      'The CSV must contain a header row and at least one question.',
    )
  }

  const headers = records[0].map((header) =>
    header.trim().toLowerCase(),
  )
  const duplicateHeader = headers.find(
    (header, index) => headers.indexOf(header) !== index,
  )

  if (duplicateHeader) {
    throw new QuestionCsvError(
      `The CSV contains the duplicate header "${duplicateHeader}".`,
    )
  }

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  )

  if (missingHeaders.length > 0) {
    throw new QuestionCsvError(
      `Missing required CSV headers: ${missingHeaders.join(', ')}.`,
    )
  }

  const dataRecords = records.slice(1)

  if (dataRecords.length > MAX_IMPORT_ROWS) {
    throw new QuestionCsvError(
      `A single CSV import is limited to ${MAX_IMPORT_ROWS} questions.`,
    )
  }

  const questions = dataRecords.map((record, index) => {
    const rowNumber = index + 2
    const values = new Map(
      headers.map((header, columnIndex) => [
        header,
        record[columnIndex] ?? '',
      ]),
    )
    const questionType =
      values.get('question_type')?.trim().toLowerCase() ||
      'multiple-choice'

    if (questionType !== 'multiple-choice') {
      throw new QuestionCsvError(
        `Row ${rowNumber}: only multiple-choice questions are supported.`,
      )
    }

    const difficulty = values
      .get('difficulty')
      ?.trim()
      .toLowerCase()

    if (!['easy', 'medium', 'hard'].includes(difficulty ?? '')) {
      throw new QuestionCsvError(
        `Row ${rowNumber}: difficulty must be easy, medium, or hard.`,
      )
    }

    const options = OPTION_HEADERS.flatMap((header, optionIndex) => {
      const text = values.get(header)?.trim() ?? ''

      return text
        ? [
            {
              label: String.fromCharCode(65 + optionIndex),
              text,
            },
          ]
        : []
    })

    const input: QuestionInput = {
      bankId,
      externalId: values.get('external_id') ?? '',
      unit: parseUnit(values.get('unit') ?? '', rowNumber),
      lesson: values.get('lesson') ?? '',
      questionType,
      difficulty: difficulty as QuestionInput['difficulty'],
      prompt: values.get('prompt') ?? '',
      options,
      correctOptionLabel:
        values.get('correct_option_label') ?? '',
      isActive: parseActive(
        values.get('is_active') ?? '',
        rowNumber,
      ),
    }
    const validationMessage = getFirstQuestionValidationError(
      validateQuestionInput(input),
    )

    if (validationMessage) {
      throw new QuestionCsvError(
        `Row ${rowNumber}: ${validationMessage}`,
      )
    }

    return input
  })
  const seenExternalIds = new Set<string>()

  for (const question of questions) {
    const key = question.externalId.trim().toLowerCase()

    if (seenExternalIds.has(key)) {
      throw new QuestionCsvError(
        `The CSV contains the duplicate question ID "${question.externalId.trim()}".`,
      )
    }

    seenExternalIds.add(key)
  }

  return questions
}
