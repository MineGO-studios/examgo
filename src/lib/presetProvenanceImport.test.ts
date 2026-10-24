import {describe,expect,it,vi} from 'vitest'
import type {PresetProvenance} from '../domain/presetCuration'
vi.mock('./supabase',()=>({supabase:{rpc:vi.fn()}}))
import {packPresetProvenanceBatches,previewPresetProvenanceImport,verifyPresetProvenanceReadback} from './presetProvenanceImport'
const ID='123e4567-e89b-42d3-a456-426614174000'
const provenance:PresetProvenance={schemaVersion:2,sourceReference:'Saved neutral release',corpusScope:'',ministerialOccurrences:null,missingEvidence:['Educational review pending']}
const entry={id:ID,revisionId:ID,provenance,privateNotes:''}
const file={format:'examgo-preset-provenance',schemaVersion:1,mappingVersion:1,importId:ID,sourceSha256:'a'.repeat(64),entries:[entry]}
describe('governed provenance import',()=>{
  it('matches semantic database evidence regardless of JSON key order and rejects changed or missing revisions',()=>{
    const reordered=Object.fromEntries(Object.entries(provenance).reverse()) as PresetProvenance
    expect(()=>verifyPresetProvenanceReadback([entry],[{...entry,provenance:reordered}])).not.toThrow()
    expect(()=>verifyPresetProvenanceReadback([entry],[{...entry,provenance:{...reordered,sourceReference:'Altered'}}])).toThrow('differs')
    expect(()=>verifyPresetProvenanceReadback([entry],[])).toThrow('differs')
  })
  it('retains missing educational evidence as draft-only report entries',()=>{
    const result=previewPresetProvenanceImport(JSON.stringify(file))
    expect(result.document.entries).toEqual([entry]);expect(result.incomplete[0].problems).toContain('Educational review pending')
    expect(result.rejected).toEqual([])
  })
  it('reports exact duplicates and rejected injected decisions without approval',()=>{
    const result=previewPresetProvenanceImport(JSON.stringify({...file,entries:[entry,entry,{...entry,approved:true}]}))
    expect(result.document.entries).toHaveLength(1);expect(result.duplicates).toEqual([{row:2,revisionId:ID}])
    expect(result.rejected[0].row).toBe(3)
  })
  it('rejects incompatible versions and malformed source release identities',()=>{
    expect(()=>previewPresetProvenanceImport(JSON.stringify({...file,schemaVersion:2}))).toThrow('schema')
    expect(()=>previewPresetProvenanceImport(JSON.stringify({...file,sourceSha256:'unknown'}))).toThrow('hash')
  })
  it('uses bounded atomic batches without dropping records',()=>{
    const entries=Array.from({length:205},()=>entry)
    const batches=packPresetProvenanceBatches(entries)
    expect(batches.map(b=>b.length)).toEqual([100,100,5]);expect(batches.flat()).toEqual(entries)
  })
})
