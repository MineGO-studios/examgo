import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PresetProvenance } from '../domain/presetCuration'
const PROVENANCE: PresetProvenance = { schemaVersion: 2, sourceReference: 'Neutral source 1', corpusScope: '', ministerialOccurrences: null, missingEvidence: [] }
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
import { assignPresetQuestionIdeas, curationViewFromDetails, getPresetCuration, getPresetCurationView, getPresetReviewer,
  parseCurationDetails, readBackPresetProvenance, savePresetProvenance, transitionPresetCuration } from './presetCurationRepository'
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
  it('loads one searched page with the selected question through the paged function',async()=>{
    const view={reviewer:'MineGO',recordCount:41,records:[RECORD],bankRecord:RECORD,selectedRecord:null,targetCount:0,targets:[],selectedTarget:null}
    mocks.rpc.mockResolvedValue({data:view,error:null})
    await expect(getPresetCurationView(ID,{search:'unit',revisionId:ID})).resolves.toEqual(view)
    expect(mocks.rpc).toHaveBeenCalledWith('get_preset_curation_view',{p_bank_id:ID,p_search:'unit',p_revision_id:ID,p_record_limit:25,p_target_limit:100})
    mocks.rpc.mockResolvedValue({data:{...view,recordCount:-1},error:null})
    await expect(getPresetCurationView(ID)).rejects.toThrow('count')
    await expect(getPresetCurationView(ID,{search:'x'.repeat(201)})).rejects.toThrow('200')
    await expect(getPresetCurationView(ID,{revisionId:'not-a-uuid'})).rejects.toThrow('identity')
  })
  it('asks only for reviewer status when checking diagnostics access',async()=>{
    mocks.rpc.mockResolvedValue({data:{reviewer:null,recordCount:0,records:[],bankRecord:null,selectedRecord:null,targetCount:0,targets:[],selectedTarget:null},error:null})
    await expect(getPresetReviewer(ID)).resolves.toBeNull()
    expect(mocks.rpc).toHaveBeenCalledWith('get_preset_curation_view',expect.objectContaining({p_record_limit:0,p_target_limit:0}))
  })
  it('falls back to the full readback until the paged function is installed',async()=>{
    const target={revisionId:ID,bankId:ID,questionId:ID,externalId:'Q1',revision:1,unit:1,lesson:'L1',prompt:'Apple?',content:{},answer:{}}
    const other={...target,revisionId:'223e4567-e89b-42d3-a456-426614174000',externalId:'Q2',prompt:'Pear?'}
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}}).mockResolvedValueOnce({data:{...DETAILS,targets:[target,other]},error:null})
    const view=await getPresetCurationView(ID,{search:'PEAR',revisionId:ID})
    expect(view).toEqual({reviewer:'MineGO',recordCount:0,records:[],bankRecord:RECORD,selectedRecord:null,
      targetCount:1,targets:[other],selectedTarget:target})
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_preset_curation',{p_bank_id:ID})
    expect(curationViewFromDetails(DETAILS,ID,{search:'neutral',revisionId:null,recordLimit:0,targetLimit:0}).recordCount).toBe(1)
  })
  it('reads back exact provenance by record identity, with a legacy fallback',async()=>{
    const row={id:ID,revisionId:null,provenance:PROVENANCE,privateNotes:null}
    mocks.rpc.mockResolvedValue({data:[row],error:null})
    await expect(readBackPresetProvenance(ID,[ID])).resolves.toEqual([row])
    expect(mocks.rpc).toHaveBeenCalledWith('get_preset_provenance_readback',{p_bank_id:ID,p_ids:[ID]})
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'42883'}}).mockResolvedValueOnce({data:DETAILS,error:null})
    await expect(readBackPresetProvenance(ID,[ID])).resolves.toEqual([RECORD])
    mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}})
    await expect(readBackPresetProvenance(ID,[ID])).rejects.toThrow('could not be loaded')
    await expect(readBackPresetProvenance(ID,[])).rejects.toThrow('10,000')
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
