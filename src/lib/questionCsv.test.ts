import { describe, expect, it } from 'vitest'
import { parseQuestionCsv } from './questionCsv'

const BANK_ID = '123e4567-e89b-42d3-a456-426614174000'

describe('parseQuestionCsv', () => {
  it('parses quoted questions and optional fields', () => {
    const questions = parseQuestionCsv(
      [
        'external_id,unit,lesson,difficulty,prompt,option_a,option_b,option_c,correct_option_label,is_active',
        'U1-Q001,1,1,easy,"Choose the word, then answer.","Hello, Ali",Goodbye,Welcome,A,true',
      ].join('\r\n'),
      BANK_ID,
    )

    expect(questions).toEqual([
      {
        bankId: BANK_ID,
        externalId: 'U1-Q001',
        unit: 1,
        lesson: '1',
        questionType: 'multiple-choice',
        difficulty: 'easy',
        prompt: 'Choose the word, then answer.',
        options: [
          { label: 'A', text: 'Hello, Ali' },
          { label: 'B', text: 'Goodbye' },
          { label: 'C', text: 'Welcome' },
        ],
        correctOptionLabel: 'A',
        isActive: true,
      },
    ])
  })

  it('reports the source row when validation fails', () => {
    expect(() =>
      parseQuestionCsv(
        [
          'external_id,unit,lesson,difficulty,prompt,option_a,option_b,correct_option_label',
          'U1-Q001,one,1,medium,Question,First,Second,A',
        ].join('\n'),
        BANK_ID,
      ),
    ).toThrow('Row 2: unit must be a whole number.')
  })

  it('rejects duplicate question IDs before import', () => {
    expect(() =>
      parseQuestionCsv(
        [
          'external_id,unit,lesson,difficulty,prompt,option_a,option_b,correct_option_label',
          'U1-Q001,1,1,medium,First question,Yes,No,A',
          'u1-q001,1,1,medium,Second question,Yes,No,B',
        ].join('\n'),
        BANK_ID,
      ),
    ).toThrow('duplicate question ID "u1-q001"')
  })

  it('rejects missing required headers', () => {
    expect(() =>
      parseQuestionCsv(
        'external_id,unit\nU1-Q001,1',
        BANK_ID,
      ),
    ).toThrow('Missing required CSV headers')
  })
})
