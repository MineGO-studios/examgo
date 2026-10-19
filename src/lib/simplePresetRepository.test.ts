import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
import {finalizeSimplePresetExam,getEligibleSimplePresets,getSimplePresetExams,parseSavedSimplePresetExam,parseSimplePresetQuestion} from './simplePresetRepository'
const ID='123e4567-e89b-42d3-a456-426614174000',OWNER='123e4567-e89b-42d3-a456-426614174001'
const question={id:ID,type:'short-answer',unit:1,lesson:'1',difficulty:'medium',prompt:'What is your name?',marks:7,
  answerLines:2,canonicalAnswer:'Ali',approvedVariants:[],caseSensitive:false}
const provenance={schemaVersion:2,sourceReference:'Neutral source',corpusScope:'',ministerialOccurrences:null,missingEvidence:[]}
const selected={revisionId:ID,curationId:ID,reviewVersion:3,marks:7,isLocked:true}
const settings={schoolName:'Fixture school',examTitle:'Preset test',teacherName:'Teacher',grade:6,unit:1,marksPerQuestion:1,questionCount:1,selectionSeed:17}
const saved={id:ID,ownerId:OWNER,sealed:true,savedAt:'2026-10-03',settings,items:[{...selected,question,provenance}],totalMarks:7}
beforeEach(()=>vi.resetAllMocks())
describe('governed preset persistence',()=>{
  it('validates one sealed historical snapshot and its exact marks',()=>{
    expect(parseSavedSimplePresetExam(saved)).toEqual(saved)
    expect(()=>parseSavedSimplePresetExam({...saved,sealed:false})).toThrow('unsealed')
    expect(()=>parseSavedSimplePresetExam({...saved,totalMarks:8})).toThrow('total')
    expect(()=>parseSavedSimplePresetExam({...saved,items:[{...saved.items[0],marks:2}]})).toThrow('marks')
  })
  it('rejects leaked private fields, partial types and invalid public answers',()=>{
    expect(()=>parseSimplePresetQuestion({...question,source:{privateName:'Hidden'}})).toThrow('Unsupported')
    expect(()=>parseSimplePresetQuestion({...question,type:'completion'})).toThrow('Unsupported')
    expect(()=>parseSimplePresetQuestion({...question,canonicalAnswer:''})).toThrow('text')
  })
  it('requires exact teacher, settings and selection readback after finalization',async()=>{
    mocks.rpc.mockResolvedValue({data:saved,error:null})
    await expect(finalizeSimplePresetExam(ID,settings,[selected],OWNER)).resolves.toEqual(saved)
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_simple_preset_exam',{p_request_id:ID,p_settings:settings,p_selections:[selected]})
    mocks.rpc.mockResolvedValue({data:{...saved,ownerId:ID},error:null})
    await expect(finalizeSimplePresetExam(ID,settings,[selected],OWNER)).rejects.toThrow('teacher request')
  })
  it('does not turn withdrawal or failed requests into successful saves',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:'40001'}})
    await expect(finalizeSimplePresetExam(ID,settings,[selected],OWNER)).rejects.toThrow('withdrawn')
  })
  it('reads only the current authorized published projection and preserves public evidence',async()=>{
    const eligible={revisionId:ID,curationId:ID,reviewVersion:3,revision:1,reviewer:'MineGO',approvedAt:'2026-10-03',
      publisher:'MineGO',publishedAt:'2026-10-03',question:{...question,marks:1},provenance}
    mocks.rpc.mockResolvedValue({data:[eligible],error:null})
    await expect(getEligibleSimplePresets()).resolves.toEqual([eligible])
    expect(mocks.rpc).toHaveBeenCalledWith('get_eligible_simple_presets',{p_after:null,p_limit:100})
  })
  it('rejects cross-teacher snapshot list readback',async()=>{
    mocks.rpc.mockResolvedValue({data:[saved],error:null})
    await expect(getSimplePresetExams(ID)).rejects.toThrow('different teacher')
  })
})
