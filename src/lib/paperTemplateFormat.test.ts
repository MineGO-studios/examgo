import {readFile,readdir} from 'node:fs/promises'
import JSZip from 'jszip'
import {DOMParser,XMLSerializer} from '@xmldom/xmldom'
import {describe,expect,it,vi} from 'vitest'
import {preparePaperTemplate} from './paperTemplateFormat'

const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const templates = (await readdir('public/templates')).filter(file=>file.endsWith('.docx'))
describe('shared paper presentation rules',()=>{
 it.each(templates)('applies presentation rules to %s without changing stored bytes or other parts',async(file)=>{
  vi.stubGlobal('DOMParser',DOMParser);vi.stubGlobal('XMLSerializer',XMLSerializer)
  try{
    const original=await readFile('public/templates/'+file),binary=Uint8Array.from(original).buffer
    const kind=file.includes('answer-key')?'key':'student'
    const output=await preparePaperTemplate(binary,kind)
    expect(Buffer.from(binary)).toEqual(original)
    const [before,after]=await Promise.all([JSZip.loadAsync(binary),JSZip.loadAsync(output)])
    const xml=await after.file('word/document.xml')!.async('string')
    const doc=new DOMParser().parseFromString(xml,'application/xml')
    const header=doc.getElementsByTagNameNS(ns,'tbl')[0].textContent!
    expect(header.indexOf('Grade {Grade}')).toBeLessThan(header.indexOf('{SchoolName}'))
    expect(header).toContain('{ExamTitle}')
    const text=Array.from(doc.getElementsByTagNameNS(ns,'p')).map(p=>p.textContent).join('\n')
    if(kind==='student'&&text.includes('{#Questions}')){
     expect(text).not.toMatch(/\(\s*\{Marks\}\s*M\.?\s*\)/)
     expect(text).toContain('{SectionMarks}')
    }
    if(kind==='student'&&text.includes('{#Branches}'))expect(text).toContain('({Marks} M.)')
    if(kind==='key'&&file.includes('simple-types'))expect(text).toContain('{Marks}')
    expect(Object.keys(after.files)).toEqual(Object.keys(before.files))
    for(const [name,part] of Object.entries(before.files))if(!part.dir&&name!=='word/document.xml'){
     expect(Buffer.from(await after.file(name)!.async('uint8array')).equals(Buffer.from(await part.async('uint8array')))).toBe(true)
    }
    const again=await JSZip.loadAsync(await preparePaperTemplate(output,kind))
    expect(await again.file('word/document.xml')!.async('string')).toBe(xml)
  }finally{vi.unstubAllGlobals()}
 })
 it('handles identity placeholders split across Word runs and rejects templates with missing identity fields',async()=>{
  vi.stubGlobal('DOMParser',DOMParser);vi.stubGlobal('XMLSerializer',XMLSerializer)
  try{
   const zip=await JSZip.loadAsync(await readFile('public/templates/iraqi-mainstream-phase-nine-exam-v1.docx'))
   const doc=new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'),'application/xml')
   const node=Array.from(doc.getElementsByTagNameNS(ns,'t')).find(n=>n.textContent==='{SchoolName}')!
   node.textContent='{School'
   const run=doc.createElementNS(ns,'w:r'),text=doc.createElementNS(ns,'w:t');text.textContent='Name}'
   run.appendChild(text);node.parentNode!.parentNode!.appendChild(run)
   zip.file('word/document.xml',new XMLSerializer().serializeToString(doc))
   const normalized=await JSZip.loadAsync(await preparePaperTemplate(await zip.generateAsync({type:'arraybuffer'}),'student'))
   const result=new DOMParser().parseFromString(await normalized.file('word/document.xml')!.async('string'),'application/xml')
   expect(result.getElementsByTagNameNS(ns,'tbl')[0].textContent).toBe('Grade {Grade}{ExamTitle}{SchoolName}')
   zip.file('word/document.xml','<w:document xmlns:w="'+ns+'"><w:body/></w:document>')
   await expect(preparePaperTemplate(await zip.generateAsync({type:'arraybuffer'}),'student')).rejects.toThrow('identity header')
  }finally{vi.unstubAllGlobals()}
 })
})
