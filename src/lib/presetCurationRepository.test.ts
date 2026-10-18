import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PresetProvenance } from '../domain/presetCuration'
const PROVENANCE: PresetProvenance = { schemaVersion: 2, sourceReference: 'Neutral source 1', corpusScope: '', ministerialOccurrences: null, missingEvidence: [] }
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
import { assignPresetQuestionIdeas, getPresetCuration, parseCurationDetails, savePresetProvenance, transitionPresetCuration } from './presetCurationRepository'
const ID='123e4567-e89b-42d3-a456-426614174000'
const RECORD={id:ID,bankId:ID,revisionId:null,version:1,state:'draft' as const,provenance:PROVENANCE,
  reviewer:null,approvedAt:null,privateNotes:null,unit:null,lesson:null,prompt:null,currentRevision:null,sourceRevision:null,published:false as const,publication:null,
  history:[{version:1,state:'draft' as const,actor:'MineGO',reason:'Evidence imported',provenance:PROVENANCE,privateNotes:null,createdAt:'2026-10-03'}]}
const DETAILS={reviewer:'MineGO',records:[RECORD],targets:[]}
beforeEach(()=>vi.resetAllMocks())
describe('curation repository',()=>{
  it('validates bounded idea batches and verifies the saved count',async()=>{
    const entries=[{revisionId:ID,ideaKey:'asking-age'}]
    await expect(assignPresetQuestionIdeas(entries,'')).rejects.toThrow('reason')
    await expect(assignPresetQuestionIdeas([{revisionId:ID,ideaKey:'Invalid name'}],'Map')).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({data:1,error:null})
    await expect(assignPresetQuestionIdeas(entries,'Reviewed batch')).resolves.toBe(1)
    expect(mocks.rpc).toHaveBeenCalledWith('assign_preset_question_ideas',{p_entries:entries,p_reason:'Reviewed batch'})
    mocks.rpc.mockResolvedValue({data:2,error:null})
    await expect(assignPresetQuestionIdeas(entries,'Map')).rejects.toThrow('readback')
  })
  it('reads protected details through the production parser',async()=>{
    mocks.rpc.mockResolvedValue({data:DETAILS,error:null})
    await expect(getPresetCuration(ID)).resolves.toEqual(DETAILS)
    expect(mocks.rpc).toHaveBeenCalledWith('get_preset_curation',{p_bank_id:ID})
  })
  it('rejects malformed or unsupported publication readback',()=>{
    expect(()=>parseCurationDetails({...DETAILS,records:[{...RECORD,published:true}]})).toThrow('publication')
    expect(()=>parseCurationDetails({...DETAILS,records:[{...RECORD,provenance:{...PROVENANCE,approved:true}}]})).toThrow('fields')
  })
  it('rejects invalid inputs before contacting the database',async()=>{
    await expect(savePresetProvenance({id:ID,bankId:ID,revisionId:null,expectedVersion:0,provenance:PROVENANCE,privateNotes:'',reason:''})).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('preserves expected version and maps stale decisions to recovery',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:'40001'}})
    await expect(transitionPresetCuration(RECORD,'in-review','Review started')).rejects.toThrow('Reload')
    expect(mocks.rpc).toHaveBeenCalledWith('transition_preset_curation',{p_id:ID,p_expected_version:1,p_state:'in-review',p_reason:'Review started'})
  })
  it('does not claim a successful decision without exact version readback',async()=>{
    mocks.rpc.mockResolvedValue({data:1,error:null})
    await expect(transitionPresetCuration(RECORD,'in-review','Review')).rejects.toThrow('readback')
  })
})
