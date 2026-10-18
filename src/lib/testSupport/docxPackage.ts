import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

export const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export function children(element: Element, name: string): Element[] {
  return Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === 1 && (node as Element).localName === name,
  )
}

export async function inspectDocx(bytes: ArrayBuffer) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) {
    if (!zip.file(name)) throw new Error(`Missing OOXML part: ${name}`)
  }
  const parts = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
  const xml = await zip.file('word/document.xml')!.async('string')
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const wordParts = await Promise.all(parts.filter((name) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)).map(async (name) => {
    const part = new DOMParser().parseFromString(await zip.file(name)!.async('string'), 'application/xml')
    return Array.from(part.getElementsByTagNameNS(WORD_NS, 'p')).map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent ?? '').join(''),
    ).join('\n')
  }))
  const relationships = await Promise.all(parts.filter((name) => name.endsWith('.rels')).map((name) => zip.file(name)!.async('string')))
  const text = wordParts.join('\n')
  if (/\{[#/]?[A-Za-z][A-Za-z0-9_.]*\}/.test(text)) throw new Error('Unresolved template tag')
  if (parts.some((name) => /vbaProject|word\/embeddings\//i.test(name))) throw new Error('Active/embedded package content')
  if (relationships.some((part) => /TargetMode="External"/.test(part))) throw new Error('External package relationship')
  const paragraphs = Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'))
  const tables = Array.from(document.getElementsByTagNameNS(WORD_NS, 'tbl')).map((table) =>
    children(table, 'tr').map((row) => children(row, 'tc').map((cell) => ({
      text: Array.from(cell.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent ?? '').join(''),
      merge: cell.getElementsByTagNameNS(WORD_NS, 'vMerge').length
        ? cell.getElementsByTagNameNS(WORD_NS, 'vMerge')[0].getAttributeNS(WORD_NS, 'val') || 'continue'
        : null,
    }))),
  )
  return { zip, xml, document, text, paragraphs, tables, packageParts: parts.length }
}
