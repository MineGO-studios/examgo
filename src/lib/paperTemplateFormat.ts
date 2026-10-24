const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function textNodes(element: Element): Element[] {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, 't'))
}

function replaceTextRange(element: Element, start: number, length: number, replacement: string): void {
  let offset = 0
  let inserted = false
  for (const node of textNodes(element)) {
    const value = node.textContent ?? ''
    const end = offset + value.length
    if (offset < start + length && end > start) {
      const left = Math.max(0, start - offset)
      const right = Math.min(value.length, start + length - offset)
      node.textContent = value.slice(0, left) + (inserted ? '' : replacement) + value.slice(right)
      inserted = true
    }
    offset = end
  }
}

/** Current presentation rules apply at export; captured content and template files stay unchanged. */
export async function preparePaperTemplate<T extends Blob | ArrayBuffer>(template: T, kind: 'student' | 'key'): Promise<T> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(template)
  const part = zip.file('word/document.xml')
  if (!part) throw new Error('The paper template has no document body.')
  const document = new DOMParser().parseFromString(await part.async('string'), 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new Error('The paper template XML is invalid.')
  const header = document.getElementsByTagNameNS(WORD_NS, 'tbl')[0]
  if (!header) throw new Error('The paper template has no identity header.')
  const headerText = textNodes(header).map(node => node.textContent ?? '').join('')
  const school = '{SchoolName}', grade = 'Grade {Grade}'
  if (headerText.split(school).length !== 2 || headerText.split(grade).length !== 2) {
    throw new Error('The paper template must identify one school and grade in its header.')
  }
  if (headerText.indexOf(school) < headerText.indexOf(grade)) {
    const replacements = [{text: school, replacement: grade}, {text: grade, replacement: school}]
      .map(field => ({...field, start: headerText.indexOf(field.text)})).sort((a, b) => b.start - a.start)
    for (const field of replacements) replaceTextRange(header, field.start, field.text.length, field.replacement)
  }
  if (kind === 'student') {
    let inQuestions = false
    for (const paragraph of Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'))) {
      const text = textNodes(paragraph).map(node => node.textContent ?? '').join('')
      if (text.includes('{#Questions}')) inQuestions = true
      if (inQuestions) {
        const annotations = [...text.matchAll(/\s*\(\s*\{Marks\}\s*M\.?\s*\)/g)].reverse()
        for (const match of annotations) replaceTextRange(paragraph, match.index!, match[0].length, '')
      }
      if (text.includes('{/Questions}')) inQuestions = false
    }
  }
  const xml = new XMLSerializer().serializeToString(document)
  zip.file('word/document.xml', xml, {createFolders: false})
  return await zip.generateAsync({type: template instanceof Blob ? 'blob' : 'arraybuffer', compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}) as T
}
