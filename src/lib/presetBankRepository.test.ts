import {beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}))
import {getPresetBanks,getPresetBankQuestions,getPresetBankBrowser} from './presetBankRepository'
const id='10000000-0000-4000-8000-000000000001'
const bank={id,name:'Official bank',grade:6,subject:'English',publishedCount:2}
const question={id,revisionId:'20000000-0000-4000-8000-000000000001',prompt:'A question?',unit:1,lesson:'1',type:'multiple-choice',difficulty:'easy'}
beforeEach(()=>vi.resetAllMocks())
it('loads shared banks through the authenticated catalogue without an owner filter',async()=>{
  mocks.rpc.mockResolvedValue({data:[bank],error:null})
  await expect(getPresetBanks()).resolves.toEqual([bank])
  expect(mocks.rpc).toHaveBeenCalledWith('get_preset_banks',{p_after:null,p_limit:100})
})
it('passes the selected bank, cursor and search to the bounded server query',async()=>{
  mocks.rpc.mockResolvedValue({data:[question],error:null})
  await expect(getPresetBankQuestions(id,null,'needle')).resolves.toEqual([question])
  expect(mocks.rpc).toHaveBeenCalledWith('get_preset_bank_questions',{p_bank_id:id,p_after:null,p_limit:50,p_search:'needle'})
})
it('rejects private fields, duplicate identities and invalid metadata',async()=>{
  for(const data of [[{...bank,owner_id:id}],[bank,bank],[{...bank,publishedCount:0}]]){
    mocks.rpc.mockResolvedValue({data,error:null});await expect(getPresetBanks()).rejects.toThrow()
  }
  mocks.rpc.mockResolvedValue({data:[{...question,private_source_notes:'hidden'}],error:null})
  await expect(getPresetBankQuestions(id)).rejects.toThrow('fields')
})
it('rejects stalled cursors and malformed requests before another page can loop',async()=>{
  mocks.rpc.mockResolvedValue({data:[question],error:null})
  await expect(getPresetBankQuestions(id,id)).rejects.toThrow('published question')
  await expect(getPresetBankQuestions('invalid')).rejects.toThrow('request')
  await expect(getPresetBankQuestions(id,null,'x'.repeat(201))).rejects.toThrow('request')
})
it('reports denied and unavailable reads without returning an invented empty bank',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'private debug'}})
  await expect(getPresetBanks()).rejects.toThrow('Sign in')
  mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
  await expect(getPresetBankQuestions(id)).rejects.toThrow('could not be loaded')
})

const browserQuestion={...question,externalId:'SOURCE-1',linked:false,content:{labelMode:'true-false',options:null},answer:{canonicalAnswer:'Correct'}}
it('projects published bank rows without pretending they are privately owned questions',async()=>{
 mocks.rpc.mockResolvedValue({data:{version:'a'.repeat(32),questions:[browserQuestion],groups:[]},error:null})
 const result=await getPresetBankBrowser(id)
 expect(result.questions[0]).toMatchObject({id,unit:1,is_active:true,question_type:'multiple-choice'})
 expect(result.questions[0]).not.toHaveProperty('owner_id');expect(result.questions[0]).not.toHaveProperty('bank_id')
 expect(mocks.rpc).toHaveBeenCalledWith('get_preset_bank_browser',{p_bank_id:id,p_after:null,p_limit:500})
})
it('rejects a private field, a private answer field or a group missing its published children',async()=>{
 for(const data of [
  {version:'a'.repeat(32),questions:[{...browserQuestion,owner_id:id}],groups:[]},
  {version:'a'.repeat(32),questions:[{...browserQuestion,answer:{private_notes:'hidden'}}],groups:[]},
  {version:'a'.repeat(32),questions:[browserQuestion],groups:[{id,revision:1,type:'passage',title:null,instructions:'Read',passage:'Context',arabicInstruction:null,attemptCount:1,questionIds:['30000000-0000-4000-8000-000000000001']}]}
 ]){mocks.rpc.mockResolvedValue({data,error:null});await expect(getPresetBankBrowser(id)).rejects.toThrow()}
})

it('rejects a bank revision change between full browser pages',async()=>{
 const rows=Array.from({length:500},(_,n)=>({...browserQuestion,id:'10000000-0000-4000-8000-'+String(n+1).padStart(12,'0')}))
 mocks.rpc.mockResolvedValueOnce({data:{version:'a'.repeat(32),questions:rows,groups:[]},error:null})
   .mockResolvedValueOnce({data:{version:'b'.repeat(32),questions:[],groups:[]},error:null})
 await expect(getPresetBankBrowser(id)).rejects.toThrow('changed')
 expect(mocks.rpc).toHaveBeenLastCalledWith('get_preset_bank_browser',{p_bank_id:id,p_after:rows.at(-1)?.id,p_limit:500})
})

it('does not mistake attempted points in one completion record for a question-count mismatch',async()=>{
 mocks.rpc.mockResolvedValue({data:{version:'a'.repeat(32),questions:[{...browserQuestion,linked:true}],groups:[{id,revision:1,type:'branch',title:null,instructions:'Complete the five blanks.',passage:null,arabicInstruction:null,attemptCount:5,questionIds:[id]}]},error:null})
 const result=await getPresetBankBrowser(id)
 expect(result.groups[0].attemptCount).toBe(5);expect(result.groups[0].questionIds).toHaveLength(1)
})
