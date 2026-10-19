/** Validate projected template data against XML 1.0 without changing source text. */
export function validateDocumentText(value: unknown): void {
  if (typeof value === 'string') {
    for (const character of value) {
      const point = character.codePointAt(0)!
      if (!(point === 9 || point === 10 || point === 13 || point >= 0x20 && point <= 0xd7ff ||
        point >= 0xe000 && point <= 0xfffd || point >= 0x10000 && point <= 0x10ffff)) {
        throw new Error('This paper contains an unsupported XML character. Review the source text before downloading. Nothing was changed.')
      }
    }
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) validateDocumentText(child)
  }
}
